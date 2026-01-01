import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, dialog } from "electron"
import url from 'url'
import path from 'path'
import fs from 'fs'

let __filename = url.fileURLToPath(import.meta.url)
let __dirname = path.dirname(__filename)

function getConfigPath(){
  return path.join(app.getPath('userData'), 'config.json')
}

async function readConfig(){
  const cfgPath = getConfigPath()
  if (!fs.existsSync(cfgPath)) return null
  try{
    const raw = fs.readFileSync(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)
    return { apiUrl: cfg.apiUrl || 'http://localhost:3000' }
  }catch{ return null }
}

async function showSetupWindow(){
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 400,
      resizable: false,
      title: '首次运行配置',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        preload: path.resolve(__dirname, 'preload.mjs')
      }
    })
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>首次运行配置</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; margin:0;padding:24px;background:#f6f8fa;} .card{background:#fff;border:1px solid #eaecef;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.04);padding:20px;} h2{margin:0 0 12px;font-size:20px} label{display:block;font-size:13px;color:#6a737d;margin:10px 0 6px} input{width:100%;height:36px;border:1px solid #d0d7de;border-radius:8px;padding:0 10px;outline:none} button{margin-top:14px;height:36px;background:#409eff;border:none;color:#fff;border-radius:8px;cursor:pointer;width:100%} .tip{font-size:12px;color:#6a737d;margin-top:8px}</style>
</head><body><div class="card"><h2>服务器配置</h2>
<label>后端API地址</label><input id="apiUrl" placeholder="例如 http://localhost:3000" value="http://localhost:3000"/>
<button id="save">保存并继续</button>
<div class="tip">提示：请确保后端服务已启动并可访问。</div>
</div>
<script>
  document.getElementById('save').onclick = async () => {
    const apiUrlInput = document.getElementById('apiUrl')
    const apiUrl = apiUrlInput.value.trim()
    if(!apiUrl){ alert('请填写API地址'); return }
    try{ 
      await window.electronAPI.saveConfig({ apiUrl })
      window.close()
    }catch(e){ alert('保存失败:'+e.message); return }
  }
</script></body></html>`
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    ipcMain.handleOnce('setup:save-config', async (_e, payload) => {
      const { apiUrl } = payload || {}
      const cfgPath = getConfigPath()
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
      fs.writeFileSync(cfgPath, JSON.stringify({ apiUrl }, null, 2), 'utf-8')
      win.close()
      resolve()
      return 'ok'
    })
  })
}

async function ensureConfig(){
  const existing = await readConfig()
  if (!existing) { await showSetupWindow() }
  
  // 注册获取配置的IPC handler
  ipcMain.handle('config:get-api-url', async () => {
    const cfg = await readConfig()
    return cfg?.apiUrl || 'http://localhost:3000'
  })
}

let mainWindow = null
let tray = null
let isQuitting = false
let isLoggedIn = false

function getTrayIconPath() {
  // 开发环境和打包后的路径候选列表
  const appPath = app.getAppPath()
  const resourcesPath = process.resourcesPath || appPath
  
  const candidates = [
    // 开发环境：electron 目录下的资源
    path.resolve(__dirname, "resource", "images", "code.ico"),
    path.resolve(process.cwd(), "electron", "resource", "images", "code.ico"),
    // 打包后：应用目录下的资源（asar: false 时）
    path.resolve(appPath, "electron", "resource", "images", "code.ico"),
    path.resolve(appPath, "resource", "images", "code.ico"),
    // 打包后：dist-electron 目录下的资源
    path.resolve(__dirname, "..", "electron", "resource", "images", "code.ico"),
    // 打包后：resources 目录（extraResources 配置）
    path.resolve(resourcesPath, "electron", "resource", "images", "code.ico"),
    path.resolve(resourcesPath, "resource", "images", "code.ico"),
    // 打包后：应用根目录（某些配置）
    path.join(appPath, "electron", "resource", "images", "code.ico"),
    path.join(appPath, "resource", "images", "code.ico"),
  ]
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('找到托盘图标:', candidate)
      return candidate
    }
  }
  
  // 如果都找不到，输出调试信息
  console.warn('未找到托盘图标')
  console.warn('app.isPackaged:', app.isPackaged)
  console.warn('app.getAppPath():', appPath)
  console.warn('process.resourcesPath:', process.resourcesPath)
  console.warn('__dirname:', __dirname)
  console.warn('搜索过的路径:', candidates)
  
  // 返回一个默认路径（即使不存在，nativeImage 会处理）
  return path.resolve(__dirname, "resource", "images", "code.ico")
}

function createTray() {
  if (tray) return tray
  
  const iconPath = getTrayIconPath()
  console.log('尝试加载托盘图标，路径:', iconPath)
  console.log('文件是否存在:', fs.existsSync(iconPath))
  console.log('app.isPackaged:', app.isPackaged)
  console.log('app.getAppPath():', app.getAppPath())
  console.log('__dirname:', __dirname)
  
  let trayIcon = nativeImage.createFromPath(iconPath)
  
  // 如果图标为空或无效，尝试其他路径
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('主路径图标加载失败，尝试备用路径')
    const fallbackPaths = [
      path.resolve(__dirname, "resource", "images", "code.ico"),
      path.resolve(app.getAppPath(), "electron", "resource", "images", "code.ico"),
    ]
    
    for (const fallbackPath of fallbackPaths) {
      if (fs.existsSync(fallbackPath)) {
        console.log('尝试备用路径:', fallbackPath)
        trayIcon = nativeImage.createFromPath(fallbackPath)
        if (trayIcon && !trayIcon.isEmpty()) {
          break
        }
      }
    }
  }
  
  // 如果仍然无效，创建一个简单的默认图标
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('所有图标路径都失败，使用默认图标')
    // 创建一个简单的 16x16 白色图标作为后备
    const emptyIcon = nativeImage.createEmpty()
    trayIcon = emptyIcon
  } else {
    // Windows 托盘图标建议设置为 16x16
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  }
  
  tray = new Tray(trayIcon)
  tray.setToolTip('聊天平台')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow()
    },
    {
      type: 'separator'
    },
    {
      label: '退出聊天平台',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  const triggerShow = () => showMainWindow()
  tray.on('double-click', triggerShow)
  tray.on('click', triggerShow)
  return tray
}

function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
  mainWindow.setSkipTaskbar(false)
}

const createWindow = async () => {
    // 读取配置以获取API地址
    const cfg = await readConfig()
    const apiUrl = cfg?.apiUrl || 'http://localhost:3000'
    
    // 设置 CSP 策略，允许所有 http 和 ws 连接（局域网应用需要）
    // 注意：HTTP响应头中的CSP优先级高于HTML meta标签
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders }
      
      // 允许所有 http、https、ws、wss 连接，以便支持局域网访问
      const csp = "default-src 'self' data: blob:; connect-src 'self' ws: http: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:;"
      
      // 移除旧的CSP头（如果存在），然后设置新的
      if (responseHeaders['content-security-policy']) {
        delete responseHeaders['content-security-policy']
      }
      if (responseHeaders['Content-Security-Policy']) {
        delete responseHeaders['Content-Security-Policy']
      }
      
      // 设置新的CSP头
      responseHeaders['Content-Security-Policy'] = [csp]
      
      callback({ responseHeaders })
    })
    
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        icon: "electron/resource/images/code.ico",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.resolve(__dirname, "preload.mjs"),
        }
    })

    if(process.env['VITE_DEV_SERVER_URL']){
        mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL'])
    }else{
        mainWindow.loadFile(path.resolve(__dirname, "../dist/index.html"))
    }
    
    // 在页面加载后，移除HTML中的旧CSP meta标签并设置新的CSP
    mainWindow.webContents.once('did-finish-load', () => {
      // 移除HTML中的CSP meta标签（如果存在）
      mainWindow.webContents.executeJavaScript(`
        (function() {
          const metaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
          metaTags.forEach(tag => tag.remove());
        })();
      `).catch(() => {});
      
      // 将配置注入到渲染进程
      if (cfg?.apiUrl) {
        mainWindow.webContents.executeJavaScript(`window.API_BASE_URL = "${cfg.apiUrl}"`).catch(() => {});
      }
    })

    mainWindow.on('close', (event) => {
      if (isQuitting) {
        return
      }
      if (isLoggedIn) {
        event.preventDefault()
        mainWindow.hide()
        mainWindow.setSkipTaskbar(true)
      }
    })

    mainWindow.on('show', () => {
      mainWindow.setSkipTaskbar(false)
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })
}

// 存储预览窗口的引用
let previewWindows = new Map()

// 创建图片预览窗口（支持多图浏览）
function createImagePreviewWindow(images, startIndex = 0) {
  const previewWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '图片预览',
    autoHideMenuBar: true,
    frame: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.resolve(__dirname, "preload.mjs"),
    }
  })

  // 创建预览窗口的 HTML
  const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>图片预览</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: #000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .preview-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .preview-image-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
    }
    .preview-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      user-select: none;
      transition: transform 0.1s ease-out;
      cursor: grab;
      position: relative;
    }
    .preview-image:active {
      cursor: grabbing;
    }
    .toolbar {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      background: rgba(0, 0, 0, 0.7);
      padding: 12px 20px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
      z-index: 1000;
    }
    .tool-btn {
      width: 44px;
      height: 44px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      border-radius: 50%;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      user-select: none;
    }
    .tool-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    .tool-btn:active {
      transform: scale(0.95);
    }
    .close-btn {
      background: rgba(255, 0, 0, 0.6);
      position: absolute;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
    }
    .close-btn:hover {
      background: rgba(255, 0, 0, 0.8);
    }
    .zoom-info {
      position: absolute;
      top: 20px;
      left: 20px;
      color: #fff;
      background: rgba(0, 0, 0, 0.5);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
    }
    /* 上一张 / 下一张 */
    .nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 48px;
      height: 60px;
      border: none;
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      border-radius: 8px;
      cursor: pointer;
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      user-select: none;
      z-index: 1000;
    }
    .nav-btn:hover { background: rgba(0, 0, 0, 0.6); }
    .nav-btn.left { left: 20px; }
    .nav-btn.right { right: 20px; }
    /* 边界提示 */
    .hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px 16px;
      border-radius: 16px;
      font-size: 14px;
      z-index: 1200;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .hint.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="preview-container">
    <button class="tool-btn close-btn" onclick="window.close()" title="关闭">✕</button>
    <div class="zoom-info" id="zoomInfo">100%</div>
    <button class="nav-btn left" title="上一张" id="btnPrev">‹</button>
    <button class="nav-btn right" title="下一张" id="btnNext">›</button>
    <div class="hint" id="edgeHint"></div>
    <div class="preview-image-wrapper">
      <img id="previewImage" class="preview-image" src="" alt="预览图片" />
    </div>
    <div class="toolbar">
      <button class="tool-btn" onclick="zoomIn()" title="放大">🔍➕</button>
      <button class="tool-btn" onclick="zoomOut()" title="缩小">🔍➖</button>
      <button class="tool-btn" onclick="resetZoom()" title="1:1">1:1</button>
      <button class="tool-btn" onclick="rotateImage()" title="旋转">↻</button>
      <button class="tool-btn" onclick="saveImage()" title="保存">💾</button>
    </div>
  </div>
  <script>
    let scale = 1;
    let rotate = 0;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartTranslateX = 0;
    let dragStartTranslateY = 0;
    const img = document.getElementById('previewImage');
    const zoomInfo = document.getElementById('zoomInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const edgeHint = document.getElementById('edgeHint');
    
    // 图片列表与当前索引
    const images = ${JSON.stringify(images)};
    let currentIndex = ${startIndex};
    const isAvatar = images.length === 1;
    
    // 如果是头像预览（只有一张图片），隐藏左右切换按钮
    if (isAvatar) {
      btnPrev.style.display = 'none';
      btnNext.style.display = 'none';
    }
    
    function updateTransform() {
      img.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale}) rotate(\${rotate}deg)\`;
      zoomInfo.textContent = Math.round(scale * 100) + '%';
    }
    function showEdgeHint(text){
      edgeHint.textContent = text;
      edgeHint.classList.add('show');
      clearTimeout(window._edgeHintTimer);
      window._edgeHintTimer = setTimeout(() => edgeHint.classList.remove('show'), 1200);
    }
    function loadImageByIndex(index){
      if (index < 0) {
        showEdgeHint('已是第一张');
        return;
      }
      if (index >= images.length) {
        showEdgeHint('已是最后一张');
        return;
      }
      currentIndex = index;
      img.src = images[currentIndex];
      // 切换图片时重置视图
      resetZoom();
    }
    // 初始化
    loadImageByIndex(currentIndex);
    
    // 鼠标拖动功能
    img.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // 左键
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartTranslateX = translateX;
        dragStartTranslateY = translateY;
        img.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        translateX = dragStartTranslateX + deltaX;
        translateY = dragStartTranslateY + deltaY;
        updateTransform();
      }
    });
    
    document.addEventListener('mouseup', (e) => {
      if (isDragging && e.button === 0) {
        isDragging = false;
        img.style.cursor = 'grab';
      }
    });
    
    // 鼠标离开窗口时也停止拖动
    document.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = 'grab';
      }
    });
    
    function zoomIn() {
      scale = Math.min(scale + 0.2, 5);
      updateTransform();
    }
    
    function zoomOut() {
      scale = Math.max(scale - 0.2, 0.5);
      updateTransform();
    }
    
    function resetZoom() {
      scale = 1;
      rotate = 0;
      translateX = 0;
      translateY = 0;
      updateTransform();
    }
    
    function rotateImage() {
      rotate += 90;
      if (rotate >= 360) rotate = 0;
      updateTransform();
    }
    
    async function saveImage() {
      try {
        const imageUrl = images[currentIndex];
        const fileName = imageUrl.split('/').pop() || 'image.png';
        
        // 使用 Electron 的下载 API
        if (window.electronAPI && window.electronAPI.downloadFile) {
          const result = await window.electronAPI.downloadFile({
            url: imageUrl,
            fileName: fileName,
            isImage: true,
            token: '' // 图片预览窗口中的图片 URL 应该已经包含认证信息或不需要认证
          });
          
          if (result.success) {
            // 可以显示成功提示，但预览窗口没有 toast，所以静默成功
          } else {
            if (result.message !== '用户取消下载') {
              alert('保存图片失败: ' + (result.message || '未知错误'));
            }
          }
        } else {
          // 非 Electron 环境，使用浏览器方式
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      } catch (e) {
        alert('保存图片失败，请重试: ' + e.message);
      }
    }
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
      if (!isAvatar) {
        // 只有非头像预览时才支持左右切换
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') loadImageByIndex(currentIndex - 1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') loadImageByIndex(currentIndex + 1);
      }
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetZoom();
      if (e.key === 'r' || e.key === 'R') rotateImage();
    });
    
    // 鼠标滚轮缩放（按住 Ctrl 键时缩放，否则滚动）
    img.addEventListener('wheel', (e) => {
      // 如果按住 Ctrl 键或者是触摸板双指缩放，则缩放图片
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      } else {
        // 否则允许窗口滚动查看图片的隐藏部分
        // 不阻止默认行为，让窗口可以滚动
      }
    });
    
    // 双击重置
    img.addEventListener('dblclick', resetZoom);
    // 左右按钮（只在非头像预览时绑定事件）
    if (!isAvatar) {
      btnPrev.addEventListener('click', () => loadImageByIndex(currentIndex - 1));
      btnNext.addEventListener('click', () => loadImageByIndex(currentIndex + 1));
    }
    
    updateTransform();
  </script>
</body>
</html>`

  previewWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(previewHtml))

  // 窗口关闭时清理引用
  previewWindow.on('closed', () => {
    // 清理逻辑占位
  })

  return previewWindow
}

// 注册 IPC 处理器：打开图片预览窗口（支持单张或多张+索引）
ipcMain.handle('image-preview:open', async (_event, payload) => {
  let images = []
  let index = 0
  if (typeof payload === 'string') {
    images = [payload]
    index = 0
  } else if (payload && Array.isArray(payload.images) && payload.images.length > 0) {
    images = payload.images
    index = Math.max(0, Math.min(payload.index || 0, images.length - 1))
  } else {
    return
  }
  createImagePreviewWindow(images, index)
})

app.whenReady().then(async () => {
  await ensureConfig()
  createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})

ipcMain.on('app:login-success', () => {
  isLoggedIn = true
  createTray()
})

ipcMain.on('app:logout', () => {
  isLoggedIn = false
  if (mainWindow) {
    showMainWindow()
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
})

ipcMain.on('app:show-main-window', () => {
  showMainWindow()
})

// 获取资源文件路径（用于渲染进程访问本地资源）
function getResourcePath(relativePath) {
  // 开发环境：使用相对路径，Vite 开发服务器可以服务这些文件
  if (process.env['VITE_DEV_SERVER_URL']) {
    // 在开发环境中，返回相对路径，Vite 会通过开发服务器提供服务
    return `/electron/resource/${relativePath}`
  }
  
  // 打包后：查找实际文件路径
  const appPath = app.getAppPath()
  const resourcesPath = process.resourcesPath || appPath
  
  // 候选路径列表（类似 getTrayIconPath）
  const candidates = [
    // 开发环境：electron 目录下的资源
    path.resolve(__dirname, "resource", relativePath),
    path.resolve(process.cwd(), "electron", "resource", relativePath),
    // 打包后：应用目录下的资源（asar: false 时）
    path.resolve(appPath, "electron", "resource", relativePath),
    path.resolve(appPath, "resource", relativePath),
    // 打包后：dist-electron 目录下的资源
    path.resolve(__dirname, "..", "electron", "resource", relativePath),
    // 打包后：resources 目录（extraResources 配置）
    path.resolve(resourcesPath, "electron", "resource", relativePath),
    path.resolve(resourcesPath, "resource", relativePath),
    // 打包后：应用根目录（某些配置）
    path.join(appPath, "electron", "resource", relativePath),
    path.join(appPath, "resource", relativePath),
  ]
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      // 返回 file:// 协议的 URL，以便在渲染进程中使用
      return `file://${candidate.replace(/\\/g, '/')}`
    }
  }
  
  // 如果都找不到，返回默认路径（即使不存在）
  return `file://${path.resolve(__dirname, "resource", relativePath).replace(/\\/g, '/')}`
}

// 注册 IPC 处理器：获取资源文件路径
ipcMain.handle('resource:get-path', async (_event, relativePath) => {
  return getResourcePath(relativePath)
})

// 注册 IPC 处理器：下载文件
ipcMain.handle('file:download', async (event, { url, fileName, isImage, token }) => {
  try {
    // 获取调用窗口（可能是主窗口或预览窗口）
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const targetWindow = senderWindow || mainWindow
    
    // 显示保存对话框
    const { canceled, filePath } = await dialog.showSaveDialog(targetWindow, {
      title: isImage ? '保存图片' : '保存文件',
      defaultPath: fileName,
      filters: isImage ? [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] },
        { name: '所有文件', extensions: ['*'] }
      ] : [
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (canceled || !filePath) {
      return { success: false, message: '用户取消下载' }
    }
    
    // 下载文件，添加认证头
    const headers = {}
    if (token) {
      headers['Authorization'] = token
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    })
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(filePath, buffer)
    
    return { success: true, filePath }
  } catch (error) {
    console.error('下载文件失败:', error)
    return { success: false, message: error.message || '下载失败' }
  }
})