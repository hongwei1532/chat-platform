import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveConfig: (cfg) => ipcRenderer.invoke('setup:save-config', cfg),
  getApiUrl: () => ipcRenderer.invoke('config:get-api-url'),
  openImagePreview: (imageUrl) => ipcRenderer.invoke('image-preview:open', imageUrl),
  downloadFile: (options) => ipcRenderer.invoke('file:download', options),
  getResourcePath: (relativePath) => ipcRenderer.invoke('resource:get-path', relativePath),
  notifyLogin: () => ipcRenderer.send('app:login-success'),
  notifyLogout: () => ipcRenderer.send('app:logout'),
  showMainWindow: () => ipcRenderer.send('app:show-main-window')
})