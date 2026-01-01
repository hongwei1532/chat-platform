// src/api/client.js - API 封装模块
let API_BASE_URL = 'http://localhost:3000'  // 默认端口改为3000，与后端保持一致
let token = localStorage.getItem('token') || ''

// 初始化 API 地址（异步）
async function initApiUrl() {
  // 先检查localStorage中是否有保存的地址
  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem('apiBaseUrl')
    if (savedUrl) {
      API_BASE_URL = savedUrl
      return
    }
  }
  
  if (window.electronAPI?.getApiUrl) {
    try {
      const url = await window.electronAPI.getApiUrl()
      if (url) {
        API_BASE_URL = url
        if (typeof window !== 'undefined') {
          localStorage.setItem('apiBaseUrl', url)
        }
      }
    } catch (e) {
      console.error('获取API地址失败:', e)
    }
  } else if (window.API_BASE_URL) {
    API_BASE_URL = window.API_BASE_URL
    if (typeof window !== 'undefined') {
      localStorage.setItem('apiBaseUrl', window.API_BASE_URL)
    }
  }
}

// 在模块加载时初始化（如果可用）
if (typeof window !== 'undefined') {
  initApiUrl()
}

// 导出给外部使用
export { initApiUrl }

export function setApiBaseUrl(url) {
  API_BASE_URL = url
  if (typeof window !== 'undefined') {
    localStorage.setItem('apiBaseUrl', url)
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

// 构建完整的API URL，处理斜杠问题
function buildUrl(endpoint) {
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}${path}`
}

export function setToken(newToken) {
  token = newToken
  if (typeof window !== 'undefined') {
    if (newToken) {
      localStorage.setItem('token', newToken)
    } else {
      localStorage.removeItem('token')
    }
  }
}

export function clearToken() {
  token = ''
  localStorage.removeItem('token')
}

async function request(endpoint, options = {}) {
  // 确保 API 地址已初始化
  await initApiUrl()
  
  // 每次都从 localStorage 读取最新的 token
  const currentToken = localStorage.getItem('token') || ''
  
  // 使用统一的URL构建函数
  const url = buildUrl(endpoint)
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }
  
  if (currentToken) {
    headers['Authorization'] = currentToken
  }
  
  try {
    console.log('API请求:', url, { method: options.method || 'GET', hasToken: !!currentToken })
    if (currentToken) {
      console.log('Token前20字符:', currentToken.substring(0, 20) + '...')
    }
    const res = await fetch(url, {
      ...options,
      headers
    })
    const data = await res.json()
    if (!res.ok || data.code !== 200) {
      console.error('API请求失败:', res.status, data)
      // 如果是token错误，清除token
      if (data.code === 4000) {
        console.error('Token验证失败，清除本地token')
        clearToken()
      }
    }
    return data
  } catch (error) {
    console.error('API请求错误:', error)
    return { code: 5000, message: '网络错误，请检查后端服务是否启动', success: false }
  }
}

// 认证相关
export const auth = {
  login: (email, password) => 
    request('/api/chat/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  
  register: async (name, email, code, password, avatarFile) => {
    await initApiUrl()
    const formData = new FormData()
    formData.append('name', name)
    formData.append('email', email)
    formData.append('code', code)
    formData.append('password', password)
    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }
    
    const url = buildUrl('/api/chat/v1/auth/register')
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('注册失败:', res.status, data)
        return data
      }
      return data
    } catch (error) {
      console.error('注册错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  loginWithEmail: (email, code) =>
    request('/api/chat/v1/auth/login-email', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    }),
  quickLogin: async (token) => {
    await initApiUrl()
    const url = buildUrl('/api/chat/v1/auth/quick-login')
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': token
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('快速登录失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('快速登录错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  sendCode: (email) =>
    request('/api/chat/v1/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  
  forgetPassword: (email, code, password) =>
    request('/api/chat/v1/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password })
    }),
  
  updateAvatar: async (avatarFile) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    const formData = new FormData()
    formData.append('avatar', avatarFile)
    
    const url = buildUrl('/api/chat/v1/auth/update-info')
    const headers = {}
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('更新头像失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新头像错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  
  updateNickname: async (name) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    
    const url = buildUrl('/api/chat/v1/auth/update-info')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name })
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('更新昵称失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新昵称错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  
  updateSignature: async (signature) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    
    const url = buildUrl('/api/chat/v1/auth/update-info')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signature })
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('更新个性签名失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新个性签名错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  
  updateInterests: async (interests) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    
    const url = buildUrl('/api/chat/v1/auth/update-info')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ interests })
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('更新兴趣爱好失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新兴趣爱好错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  
  updateUsername: async (username, password) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    
    const url = buildUrl('/api/chat/v1/auth/update-username')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ newUsername: username, password })
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        console.error('更新用户名失败:', res.status, data)
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新用户名错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  }
}

// 好友相关
export const friend = {
  getList: () => request('/api/chat/v1/friend/list'),
  getRecommendations: () => request('/api/chat/v1/friend/recommendations'),
  getRecommendationReason: (user_id) => request(`/api/chat/v1/friend/recommendation-reason?user_id=${user_id}`),
  add: (username, id) => 
    request('/api/chat/v1/friend/add', {
      method: 'POST',
      body: JSON.stringify({ username, id })
    }),
  search: (keyword) => request(`/api/chat/v1/friend/search?keyword=${encodeURIComponent(keyword)}`),
  getInfo: (group_id, user_id) => request(`/api/chat/v1/friend/info?group_id=${group_id}&user_id=${user_id}`),
  createGroup: (data) => 
    request('/api/chat/v1/friend/group/create', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getGroupList: () => request('/api/chat/v1/friend/group/list'),
  updateFriend: (data) => 
    request('/api/chat/v1/friend/update', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getUserInfo: (user_id) => request(`/api/chat/v1/friend/user-info?user_id=${user_id}`),
  updateRemark: (user_id, remark) =>
    request('/api/chat/v1/friend/update-remark', {
      method: 'POST',
      body: JSON.stringify({ user_id, remark })
    }),
  sendRequest: ({ receiver_id, greeting, remark }) =>
    request('/api/chat/v1/friend/request/send', {
      method: 'POST',
      body: JSON.stringify({ receiver_id, greeting, remark })
    }),
  getRequests: () => request('/api/chat/v1/friend/request/list'),
  respondRequest: (request_id, action) =>
    request('/api/chat/v1/friend/request/respond', {
      method: 'POST',
      body: JSON.stringify({ request_id, action })
    }),
  delete: (user_id) =>
    request('/api/chat/v1/friend/delete', {
      method: 'POST',
      body: JSON.stringify({ user_id })
    }),
  block: (user_id) =>
    request('/api/chat/v1/friend/block', {
      method: 'POST',
      body: JSON.stringify({ user_id })
    }),
  unblock: (user_id) =>
    request('/api/chat/v1/friend/unblock', {
      method: 'POST',
      body: JSON.stringify({ user_id })
    }),
  getBlacklist: () => request('/api/chat/v1/friend/blacklist')
}

// 群聊相关
export const group = {
  getList: () => request('/api/chat/v1/group/list'),
  search: (name) => request(`/api/chat/v1/group/search?name=${name}`),
  create: (data) => {
    const formData = new FormData()
    formData.append('name', data.name)
    formData.append('members', JSON.stringify(data.members))
    if (data.avatar) {
      formData.append('avatar', data.avatar)
    }
    return request('/api/chat/v1/group/create', {
      method: 'POST',
      body: formData,
      headers: {} // 不设置Content-Type，让浏览器自动设置
    })
  },
  join: (group_id) => request(`/api/chat/v1/group/join?group_id=${group_id}`),
  getInfo: (group_id) => request(`/api/chat/v1/group/info?group_id=${group_id}`),
  getMembers: (group_id) => request(`/api/chat/v1/group/members?group_id=${group_id}`),
  updateAvatar: async (group_id, avatarFile) => {
    await initApiUrl()
    const currentToken = localStorage.getItem('token') || ''
    const formData = new FormData()
    formData.append('group_id', group_id)
    formData.append('avatar', avatarFile)
    
    const url = buildUrl('/api/chat/v1/group/update-avatar')
    const headers = {}
    if (currentToken) {
      headers['Authorization'] = currentToken
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      })
      const data = await res.json()
      if (!res.ok || data.code !== 200) {
        if (data.code === 4000) {
          clearToken()
        }
        return data
      }
      return data
    } catch (error) {
      console.error('更新群聊头像错误:', error)
      return { code: 5000, message: '网络错误', success: false }
    }
  },
  updateName: (group_id, name) =>
    request('/api/chat/v1/group/rename', {
      method: 'POST',
      body: JSON.stringify({ group_id, name: name || null })
    }),
  updateRemark: (group_id, remark) =>
    request('/api/chat/v1/group/update-remark', {
      method: 'POST',
      body: JSON.stringify({ group_id, remark })
    }),
  getRemark: (group_id) => request(`/api/chat/v1/group/remark?group_id=${group_id}`),
  updateNickname: (group_id, nickname) =>
    request('/api/chat/v1/group/update-nickname', {
      method: 'POST',
      body: JSON.stringify({ group_id, nickname })
    }),
  invite: (group_id, userList) =>
    request('/api/chat/v1/group/invite', {
      method: 'POST',
      body: JSON.stringify({ group_id, userList })
    }),
  leave: (group_id) =>
    request('/api/chat/v1/group/leave', {
      method: 'POST',
      body: JSON.stringify({ group_id })
    }),
  transferOwnership: (group_id, new_creator_id) =>
    request('/api/chat/v1/group/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ group_id, new_creator_id })
    }),
  disband: (group_id) =>
    request('/api/chat/v1/group/disband', {
      method: 'POST',
      body: JSON.stringify({ group_id })
    }),
  getAdmins: (group_id) => request(`/api/chat/v1/group/admins?group_id=${group_id}`),
  addAdmins: (group_id, user_ids) =>
    request('/api/chat/v1/group/add-admins', {
      method: 'POST',
      body: JSON.stringify({ group_id, user_ids })
    }),
  removeAdmin: (group_id, admin_user_id) =>
    request('/api/chat/v1/group/remove-admin', {
      method: 'POST',
      body: JSON.stringify({ group_id, admin_user_id })
    }),
  removeMember: (group_id, user_id) =>
    request('/api/chat/v1/group/remove-member', {
      method: 'POST',
      body: JSON.stringify({ group_id, user_id })
    }),
  updateAnnouncement: (group_id, announcement) =>
    request('/api/chat/v1/group/update-announcement', {
      method: 'POST',
      body: JSON.stringify({ group_id, announcement })
    }),
  publishAnnouncement: (group_id) =>
    request('/api/chat/v1/group/publish-announcement', {
      method: 'POST',
      body: JSON.stringify({ group_id })
    })
}

// 消息相关
export const messagesApi = {
  getList: () => request('/api/chat/v1/message/list'),
  searchHistory: (room, type, options = {}) => {
    const params = new URLSearchParams({ room, type })
    if (options.keyword) params.append('keyword', options.keyword)
    if (options.media_type) params.append('media_type', options.media_type)
    if (options.date) params.append('date', options.date)
    return request(`/api/chat/v1/message/search-history?${params.toString()}`)
  },
  recall: (message_id) =>
    request('/api/chat/v1/message/recall', {
      method: 'POST',
      body: JSON.stringify({ message_id })
    }),
  delete: (message_id) =>
    request('/api/chat/v1/message/delete', {
      method: 'POST',
      body: JSON.stringify({ message_id })
    }),
  pin: (room) =>
    request('/api/chat/v1/message/pin', {
      method: 'POST',
      body: JSON.stringify({ room })
    }),
  unpin: (room) =>
    request('/api/chat/v1/message/unpin', {
      method: 'POST',
      body: JSON.stringify({ room })
    }),
  mute: (room) =>
    request('/api/chat/v1/message/mute', {
      method: 'POST',
      body: JSON.stringify({ room })
    }),
  unmute: (room) =>
    request('/api/chat/v1/message/unmute', {
      method: 'POST',
      body: JSON.stringify({ room })
    }),
  forward: (message_id, target_room) =>
    request('/api/chat/v1/message/forward', {
      method: 'POST',
      body: JSON.stringify({ message_id, target_room })
    }),
  forwardMultiple: (message_ids, target_room) =>
    request('/api/chat/v1/message/forward-multiple', {
      method: 'POST',
      body: JSON.stringify({ message_ids, target_room })
    }),
  markMentionRead: (message_id) =>
    request('/api/chat/v1/message/mark-mention-read', {
      method: 'POST',
      body: JSON.stringify({ message_id })
    }),
  // 收藏相关API
  getFavorites: () =>
    request('/api/chat/v1/favorite/list', {
      method: 'GET'
    }),
  addFavorite: (message_id, type, content, file_size = null) =>
    request('/api/chat/v1/favorite/add', {
      method: 'POST',
      body: JSON.stringify({ message_id, type, content, file_size })
    }),
  removeFavorite: (favorite_id) =>
    request('/api/chat/v1/favorite/remove', {
      method: 'POST',
      body: JSON.stringify({ favorite_id })
    }),
  deleteChat: (room) =>
    request('/api/chat/v1/message/delete-chat', {
      method: 'POST',
      body: JSON.stringify({ room })
    })
}

// AI好友相关
export const aiFriend = {
  // 获取AI好友信息
  get: () => request('/api/chat/v1/ai-friend/', {
    method: 'GET'
  }),
  // 创建或更新AI好友
  createOrUpdate: (friend_type, clear_context = false) => request('/api/chat/v1/ai-friend/', {
    method: 'POST',
    body: JSON.stringify({ friend_type, clear_context })
  }),
  // 获取AI好友聊天历史
  getHistory: (room, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ room, limit: limit.toString(), offset: offset.toString() })
    return request(`/api/chat/v1/ai-friend/history?${params.toString()}`, {
      method: 'GET'
    })
  },
  // 更新AI好友设置
  updateSettings: (user_nickname, ai_name) => request('/api/chat/v1/ai-friend/settings', {
    method: 'PUT',
    body: JSON.stringify({ user_nickname, ai_name })
  }),
  // 清空AI好友上下文
  clearContext: () => request('/api/chat/v1/ai-friend/clear-context', {
    method: 'POST'
  }),
  // 流式聊天 WebSocket 连接
  createChatStream: (onMessage, onError, onClose) => {
    return new Promise((resolve, reject) => {
      // 处理WebSocket URL，避免双斜杠
      const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
      const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')
      const token = localStorage.getItem('token') || ''
      const ws = new WebSocket(`${wsUrl}/api/chat/v1/ai-friend/chat-stream?token=${encodeURIComponent(token)}`)
      
      ws.onopen = () => {
        resolve(ws)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.error) {
            if (onError) onError(data.error)
          } else if (data.type === 'chunk') {
            if (onMessage) onMessage(data.content, false)
          } else if (data.type === 'done') {
            if (onMessage) onMessage(data.content, true)
          }
        } catch (e) {
          console.error('解析AI好友消息失败:', e)
          if (onError) onError('解析消息失败')
        }
      }
      
      ws.onerror = (error) => {
        console.error('AI好友WebSocket错误:', error)
        if (onError) onError('连接错误')
        reject(error)
      }
      
      ws.onclose = () => {
        if (onClose) onClose()
      }
    })
  }
}

// DeepSeek AI 相关
export const deepseek = {
  // 非流式聊天
  chat: (messages, options = {}) => {
    const { model = 'deepseek-chat', temperature = 0.7, max_tokens = 2000 } = options
    return request('/api/chat/v1/deepseek/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        model,
        temperature,
        max_tokens
      })
    })
  },
  
  // 流式聊天 WebSocket 连接
  createChatStream: (onMessage, onError, onClose) => {
    return new Promise((resolve, reject) => {
      // 处理WebSocket URL，避免双斜杠
      const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
      const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')
      const ws = new WebSocket(`${wsUrl}/api/chat/v1/deepseek/chat-stream`)
      
      ws.onopen = () => {
        resolve(ws)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (onMessage) {
            onMessage(data)
          }
        } catch (error) {
          console.error('解析 DeepSeek 消息失败:', error)
          if (onError) {
            onError(error)
          }
        }
      }
      
      ws.onerror = (error) => {
        console.error('DeepSeek WebSocket 错误:', error)
        if (onError) {
          onError(error)
        }
        reject(error)
      }
      
      ws.onclose = () => {
        if (onClose) {
          onClose()
        }
      }
      
      return ws
    })
  }
}

// 健康检查
export const health = () => request('/health')

// WebSocket连接
export function createWebSocket(room, id, type) {
  return new Promise((resolve, reject) => {
    // 处理WebSocket URL，避免双斜杠
    const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
    const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')
    const ws = new WebSocket(`${wsUrl}/api/chat/v1/message/chat?room=${room}&id=${id}&type=${type}`)
    
    ws.onopen = () => {
      resolve(ws)
    }
    
    ws.onerror = (error) => {
      reject(error)
    }
    
    return ws
  })
}
