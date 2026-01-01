<template>
  <div class="card">
    <h2 class="card-title" v-if="mode === 'login'">登录</h2>
    <h2 class="card-title" v-else>注册新用户</h2>

    <!-- 已保存的账户列表 -->
    <div v-if="mode === 'login' && savedAccounts.length > 0" class="saved-accounts">
      <div class="saved-accounts-header">
        <div class="saved-accounts-title">已登录账户</div>
        <button 
          v-if="savedAccounts.length > 1"
          class="expand-toggle-btn"
          @click="showAllSavedAccounts = !showAllSavedAccounts"
          :title="showAllSavedAccounts ? '收起' : '展开'"
        >
          <span class="expand-icon" :class="{ expanded: showAllSavedAccounts }">▼</span>
        </button>
      </div>
      <div class="saved-accounts-list">
        <div 
          v-for="account in displayedSavedAccounts" 
          :key="account.email"
          class="saved-account-item"
          @click="quickLoginWithAccount(account)"
          :title="account.name || account.email"
        >
          <div class="saved-account-avatar">
            <img 
              v-if="account.avatar" 
              :src="getAvatarUrl(account.avatar)" 
              :alt="account.name || account.email"
            />
            <div v-else class="avatar-placeholder">
              {{ (account.name || account.email).charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="saved-account-info">
            <div class="saved-account-name">{{ account.name || account.email }}</div>
            <div class="saved-account-email">{{ account.email }}</div>
          </div>
          <button 
            class="remove-account-btn"
            @click.stop="removeSavedAccount(account.email)"
            title="删除此账户"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <!-- 登录方式切换 -->
    <div v-if="mode === 'login'" class="login-tabs">
      <button 
        :class="['tab-btn', { active: loginMethod === 'email' }]"
        @click="loginMethod = 'email'"
      >
        邮箱+密码
      </button>
      <button 
        :class="['tab-btn', { active: loginMethod === 'code' }]"
        @click="loginMethod = 'code'"
      >
        邮箱+验证码
      </button>
    </div>

    <!-- 登录表单容器 -->
    <div v-if="mode === 'login'" class="scrollable-form-container">
      <!-- 邮箱+密码登录表单 -->
      <form v-if="loginMethod === 'email'" class="form scrollable-form" @submit.prevent="onLogin">
        <div class="form-item">
          <label>邮箱</label>
          <input v-model="email" type="email" required placeholder="请输入邮箱" />
        </div>
        <div class="form-item">
          <label>密码</label>
          <input v-model="password" type="password" required maxlength="16" placeholder="请输入密码" />
        </div>
        <button class="btn primary" type="submit">登录</button>
      </form>

      <!-- 邮箱+验证码登录表单 -->
      <form v-if="loginMethod === 'code'" class="form scrollable-form" @submit.prevent="onLoginWithEmail">
        <div class="form-item">
          <label>邮箱</label>
          <input v-model="email" type="email" required placeholder="请输入邮箱" />
        </div>
        <div class="form-item">
          <label>验证码</label>
          <div class="code-input-row">
            <input 
              v-model="code" 
              type="text" 
              required 
              maxlength="6" 
              placeholder="请输入验证码" 
              class="code-input"
            />
            <button 
              type="button" 
              class="btn send-code-btn" 
              :disabled="codeSending || countdown > 0"
              @click="sendCode"
            >
              {{ countdown > 0 ? `${countdown}秒` : (codeSending ? '发送中...' : '发送验证码') }}
            </button>
          </div>
        </div>
        <button class="btn primary" type="submit">登录</button>
      </form>
    </div>

    <!-- 注册表单 -->
    <div v-if="mode === 'register'" class="scrollable-form-container">
      <form class="form scrollable-form" @submit.prevent="onRegister">
        <div class="form-item">
          <label>头像（可选）</label>
          <div class="avatar-upload">
            <div 
              v-if="avatarPreview" 
              class="avatar-preview"
              :style="{ backgroundImage: `url(${avatarPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
            >
              <button type="button" class="remove-avatar" @click="removeAvatar">×</button>
            </div>
            <label v-else class="avatar-upload-btn">
              <input 
                ref="avatarInput"
                type="file" 
                accept="image/*" 
                style="display: none"
                @change="handleAvatarSelect"
              />
              <span>选择头像</span>
            </label>
          </div>
        </div>
        <div class="form-item">
          <label>昵称 <span class="required">*</span></label>
          <input v-model="name" required maxlength="20" placeholder="请输入昵称" />
        </div>
        <div class="form-item">
          <label>邮箱 <span class="required">*</span></label>
          <input 
            v-model="email" 
            type="email" 
            required
            placeholder="请输入邮箱" 
            @input="handleEmailInput"
          />
        </div>
        <div class="form-item">
          <label>验证码 <span class="required">*</span></label>
          <div class="code-input-row">
            <input 
              v-model="code" 
              type="text" 
              required
              maxlength="6" 
              placeholder="请输入验证码" 
              class="code-input"
            />
            <button 
              type="button" 
              class="btn send-code-btn" 
              :disabled="codeSending || countdown > 0 || !email || !email.trim()"
              @click="sendCode"
            >
              {{ countdown > 0 ? `${countdown}秒` : (codeSending ? '发送中...' : '发送验证码') }}
            </button>
          </div>
          <div class="form-hint">
            点击"发送验证码"按钮获取验证码
          </div>
        </div>
        <div class="form-item">
          <label>密码 <span class="required">*</span></label>
          <input 
            v-model="password" 
            type="password" 
            required 
            minlength="8"
            maxlength="16" 
            placeholder="8-16位，字母+数字+字符组合"
            @input="validatePassword"
            @blur="validatePassword"
            :class="{ 'input-error': passwordError }"
          />
          <div v-if="passwordError" class="form-error">
            {{ passwordError }}
          </div>
          <div v-else class="form-hint">
            密码要求：8-16位，必须包含英文字母和数字，不能是纯数字
          </div>
        </div>
        <button class="btn primary" type="submit">注册</button>
      </form>
    </div>

    <!-- 登录模式下的链接行：注册和忘记密码 -->
    <div v-if="mode === 'login'" class="login-links-row">
      <a href="#" @click.prevent="toggleMode" class="login-link">
        没有账号？注册新用户
      </a>
      <a href="#" @click.prevent="showForgetPassword = true" class="login-link">
        忘记密码？
      </a>
    </div>
    
    <!-- 注册模式下的链接行：去登录 -->
    <div v-else class="muted">
      <a href="#" @click.prevent="toggleMode">
        已有账号？去登录
      </a>
    </div>
    <div v-if="error" class="msg err">{{ error }}</div>
    <div v-if="successMsg" class="msg ok">{{ successMsg }}</div>
    
    <!-- 忘记密码对话框 -->
    <div v-if="showForgetPassword" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>忘记密码</h3>
          <button class="modal-close-btn" @click="showForgetPassword = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-item">
            <label>邮箱</label>
            <input v-model="forgetEmail" type="email" required placeholder="请输入邮箱" />
          </div>
          <div class="form-item">
            <label>验证码</label>
            <div class="code-input-row">
              <input 
                v-model="forgetCode" 
                type="text" 
                required 
                maxlength="6" 
                placeholder="请输入验证码" 
                class="code-input"
              />
              <button 
                type="button" 
                class="btn send-code-btn" 
                :disabled="codeSending || countdown > 0"
                @click="sendForgetCode"
              >
                {{ countdown > 0 ? `${countdown}秒` : (codeSending ? '发送中...' : '发送验证码') }}
              </button>
            </div>
          </div>
          <div class="form-item">
            <label>新密码</label>
            <input 
              v-model="newPassword" 
              type="password" 
              required 
              minlength="8"
              maxlength="16" 
              placeholder="8-16位，字母+数字+字符组合"
              @input="forgetPasswordError = validateNewPassword()"
              @blur="forgetPasswordError = validateNewPassword()"
              :class="{ 'input-error': forgetPasswordError }"
            />
            <div v-if="forgetPasswordError" class="form-error">
              {{ forgetPasswordError }}
            </div>
            <div v-else class="form-hint">
              密码要求：8-16位，必须包含英文字母和数字，不能是纯数字
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showForgetPassword = false" class="modal-btn cancel-btn">取消</button>
          <button @click="onForgetPassword" class="modal-btn confirm-btn">重置密码</button>
        </div>
      </div>
    </div>
    
    <!-- 图片裁剪对话框 -->
    <ImageCropper
      :show="showCropper"
      :imageSrc="cropperImageSrc"
      @confirm="handleCropConfirm"
      @cancel="handleCropCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { auth, setToken, setApiBaseUrl, clearToken, getApiBaseUrl } from '../api/client'
import ImageCropper from './ImageCropper.vue'
import { getSavedAccounts, saveAccount, removeAccount } from '../utils/accountStorage'

const emits = defineEmits(['login-success'])

const name = ref('') // 注册时的昵称
const password = ref('')
const email = ref('')
const code = ref('')
const error = ref('')
const successMsg = ref('')
const mode = ref('login') // login or register
const loginMethod = ref('email') // email (邮箱+密码) or code (邮箱+验证码)
const codeSending = ref(false)
const countdown = ref(0)
let countdownTimer = null

// 头像上传相关
const avatarInput = ref(null)
const avatarPreview = ref('')
const avatarFile = ref(null)
const showCropper = ref(false)
const cropperImageSrc = ref('')

// 忘记密码相关
const showForgetPassword = ref(false)
const forgetEmail = ref('')
const forgetCode = ref('')
const newPassword = ref('')
const forgetPasswordError = ref('')

// 密码验证相关
const passwordError = ref('')

// 已保存的账户列表
const savedAccounts = ref([])
// 是否展开显示所有已保存账户
const showAllSavedAccounts = ref(false)

// 计算显示的账户列表（默认只显示第一项）
const displayedSavedAccounts = computed(() => {
  if (showAllSavedAccounts.value || savedAccounts.value.length <= 1) {
    return savedAccounts.value
  }
  return savedAccounts.value.slice(0, 1)
})

// 获取头像URL
const getAvatarUrl = (avatarPath) => {
  if (!avatarPath) return ''
  if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
    return avatarPath
  }
  const baseUrl = getApiBaseUrl()
  const path = avatarPath.startsWith('/') ? avatarPath : `/${avatarPath}`
  return `${baseUrl}${path}`
}

// 加载已保存的账户
const loadSavedAccounts = () => {
  savedAccounts.value = getSavedAccounts()
}

// 快速登录（使用已保存的账户）
const quickLoginWithAccount = async (account) => {
  if (!account.token) {
    error.value = '该账户的登录信息已过期，请重新登录'
    // 删除过期账户
    removeSavedAccount(account.email)
    return
  }
  
  error.value = ''
  successMsg.value = ''
  
  try {
    // 先设置token
    setToken(account.token)
    
    // 调用快速登录接口验证token
    const data = await auth.quickLogin(account.token)
    
    if (data.code === 200 && data.data) {
      // 更新token（可能服务器返回了新的token）
      if (data.data.token) {
        setToken(data.data.token)
      }
      
      // 更新账户信息
      saveAccount({
        email: data.data.info.email,
        avatar: data.data.info.avatar,
        name: data.data.info.name,
        token: data.data.token || account.token
      })
      
      emits('login-success', data.data.info)
    } else {
      // token无效，删除该账户
      error.value = '身份认证过期，请重新登录'
      removeSavedAccount(account.email)
    }
  } catch (e) {
    error.value = '快速登录失败: ' + e.message
    // 如果是因为token过期，删除该账户
    if (e.message.includes('4000') || e.message.includes('token')) {
      removeSavedAccount(account.email)
    }
  }
}

// 删除已保存的账户
const removeSavedAccount = (email) => {
  removeAccount(email)
  loadSavedAccounts()
}

onMounted(async () => {
  // 清除可能存在的旧token
  clearToken()
  
  // 从 Electron 获取 API 地址
  if (window.electronAPI?.getApiUrl) {
    const apiUrl = await window.electronAPI.getApiUrl()
    setApiBaseUrl(apiUrl)
  } else if (window.API_BASE_URL) {
    setApiBaseUrl(window.API_BASE_URL)
  }
  
  // 加载已保存的账户
  loadSavedAccounts()
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})

// 发送验证码
const sendCode = async () => {
  if (!email.value) {
    error.value = '请先输入邮箱'
    return
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) {
    error.value = '邮箱格式不正确'
    return
  }
  
  codeSending.value = true
  error.value = ''
  successMsg.value = ''
  
  try {
    const data = await auth.sendCode(email.value)
    if (data.code === 200) {
      successMsg.value = '验证码已发送，请查收邮件'
      // 开始倒计时（60秒）
      countdown.value = 60
      countdownTimer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) {
          clearInterval(countdownTimer)
          countdownTimer = null
        }
      }, 1000)
    } else {
      error.value = data.message || '发送验证码失败'
    }
  } catch (e) {
    error.value = '发送验证码失败: ' + e.message
  } finally {
    codeSending.value = false
  }
}

const onLogin = async () => {
  error.value = ''
  successMsg.value = ''
  try {
    console.log('开始登录:', email.value)
    // 清除可能存在的旧token
    clearToken()
    
    const data = await auth.login(email.value, password.value)
    console.log('登录响应:', data)
    
    if (data.code === 200 && data.data) {
      if (data.data.token) {
        setToken(data.data.token)
        console.log('Token已保存，长度:', data.data.token.length)
        console.log('Token前20字符:', data.data.token.substring(0, 20) + '...')
        
        // 验证token是否真的保存了
        const savedToken = localStorage.getItem('token')
        console.log('验证保存的token:', savedToken ? savedToken.substring(0, 20) + '...' : '未找到')
      }
      
      // 保存账户信息
      if (data.data.info) {
        saveAccount({
          email: data.data.info.email,
          avatar: data.data.info.avatar,
          name: data.data.info.name,
          token: data.data.token
        })
        loadSavedAccounts()
      }
      
      emits('login-success', data.data.info)
    } else {
      error.value = data.message || '登录失败'
      console.error('登录失败:', data)
    }
  } catch (e) {
    error.value = '登录失败: ' + e.message
    console.error('登录异常:', e)
  }
}

const onLoginWithEmail = async () => {
  error.value = ''
  successMsg.value = ''
  try {
    console.log('开始邮箱登录:', email.value)
    // 清除可能存在的旧token
    clearToken()
    
    const data = await auth.loginWithEmail(email.value, code.value)
    console.log('邮箱登录响应:', data)
    
    if (data.code === 200 && data.data) {
      if (data.data.token) {
        setToken(data.data.token)
        console.log('Token已保存')
      }
      
      // 保存账户信息
      if (data.data.info) {
        saveAccount({
          email: data.data.info.email,
          avatar: data.data.info.avatar,
          name: data.data.info.name,
          token: data.data.token
        })
        loadSavedAccounts()
      }
      
      emits('login-success', data.data.info)
    } else {
      error.value = data.message || '登录失败'
      console.error('邮箱登录失败:', data)
    }
  } catch (e) {
    error.value = '登录失败: ' + e.message
    console.error('邮箱登录异常:', e)
  }
}

// 头像选择处理
const handleAvatarSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      error.value = '请选择图片文件'
      if (avatarInput.value) {
        avatarInput.value.value = ''
      }
      return
    }
    
    if (file.size > 5 * 1024 * 1024) {
      error.value = '头像文件大小不能超过5MB'
      if (avatarInput.value) {
        avatarInput.value.value = ''
      }
      return
    }
    
    // 读取文件并显示裁剪对话框
    const reader = new FileReader()
    reader.onload = (e) => {
      cropperImageSrc.value = e.target.result
      showCropper.value = true
    }
    reader.readAsDataURL(file)
  }
}

// 裁剪确认
const handleCropConfirm = (croppedFile) => {
  avatarFile.value = croppedFile
  const reader = new FileReader()
  reader.onload = (e) => {
    avatarPreview.value = e.target.result
  }
  reader.readAsDataURL(croppedFile)
  showCropper.value = false
  cropperImageSrc.value = ''
  // 清空文件输入，允许重复选择同一文件
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// 裁剪取消
const handleCropCancel = () => {
  showCropper.value = false
  cropperImageSrc.value = ''
  // 清空文件输入
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

const removeAvatar = () => {
  avatarFile.value = null
  avatarPreview.value = ''
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// 发送忘记密码验证码
const sendForgetCode = async () => {
  if (!forgetEmail.value) {
    error.value = '请先输入邮箱'
    return
  }
  // 临时保存当前邮箱，发送验证码，然后恢复
  const originalEmail = email.value
  email.value = forgetEmail.value
  await sendCode()
  email.value = originalEmail
}

// 忘记密码
const onForgetPassword = async () => {
  error.value = ''
  successMsg.value = ''
  try {
    if (!forgetEmail.value || !forgetCode.value || !newPassword.value) {
      error.value = '请填写完整信息'
      return
    }
    
    // 验证新密码格式
    const passwordValidationError = validateNewPassword()
    if (passwordValidationError) {
      forgetPasswordError.value = passwordValidationError
      error.value = passwordValidationError
      return
    }
    
    const data = await auth.forgetPassword(forgetEmail.value, forgetCode.value, newPassword.value)
    if (data.code === 200) {
      successMsg.value = '密码重置成功，请使用新密码登录'
      showForgetPassword.value = false
      forgetEmail.value = ''
      forgetCode.value = ''
      newPassword.value = ''
      setTimeout(() => {
        successMsg.value = ''
      }, 3000)
    } else {
      error.value = data.message || '密码重置失败'
    }
  } catch (e) {
    error.value = '密码重置失败: ' + e.message
  }
}

const onRegister = async () => {
  error.value = ''
  successMsg.value = ''
  
  // 先验证密码格式
  validatePassword()
  if (passwordError.value) {
    return // 密码格式不正确，不提交
  }
  
  try {
    console.log('开始注册:', name.value, email.value)
    
    // 验证必填字段
    if (!name.value || !email.value || !code.value || !password.value) {
      error.value = '请填写所有必填项'
      return
    }
    
    const data = await auth.register(
      name.value, 
      email.value, 
      code.value, 
      password.value, 
      avatarFile.value || undefined
    )
    console.log('注册响应:', data)
    if (data.code === 200 && data.data) {
      if (data.data.token) {
        setToken(data.data.token)
        console.log('Token已保存')
      }
      successMsg.value = '注册成功！'
      
      // 保存账户信息
      if (data.data.info) {
        saveAccount({
          email: data.data.info.email,
          avatar: data.data.info.avatar,
          name: data.data.info.name,
          token: data.data.token
        })
        loadSavedAccounts()
      }
      
      // 清空表单
      name.value = ''
      password.value = ''
      email.value = ''
      code.value = ''
      removeAvatar()
      setTimeout(() => {
        emits('login-success', data.data.info)
      }, 500)
    } else {
      error.value = data.message || '注册失败'
      console.error('注册失败:', data)
    }
  } catch (e) {
    error.value = '注册失败: ' + e.message
    console.error('注册异常:', e)
  }
}

const handleEmailInput = () => {
  // 当邮箱输入时，确保验证码输入框能正确显示
  // Vue的响应式系统会自动处理，这里可以添加额外的逻辑
}

// 密码格式验证（与后端保持一致）
const validatePassword = () => {
  passwordError.value = ''
  
  if (!password.value) {
    return // 空值时不显示错误，由required属性处理
  }
  
  // 检查长度
  if (password.value.length < 8 || password.value.length > 16) {
    passwordError.value = '密码长度必须在8-16位之间'
    return
  }
  
  // 检查是否是纯数字
  if (/^\d+$/.test(password.value)) {
    passwordError.value = '密码不能是纯数字'
    return
  }
  
  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(password.value)) {
    passwordError.value = '密码必须包含英文字母'
    return
  }
  
  // 检查是否包含数字
  if (!/\d/.test(password.value)) {
    passwordError.value = '密码必须包含数字'
    return
  }
  
  // 验证通过，清除错误
  passwordError.value = ''
}

// 忘记密码时的密码验证
const validateNewPassword = () => {
  if (!newPassword.value) {
    return ''
  }
  
  // 检查长度
  if (newPassword.value.length < 8 || newPassword.value.length > 16) {
    return '密码长度必须在8-16位之间'
  }
  
  // 检查是否是纯数字
  if (/^\d+$/.test(newPassword.value)) {
    return '密码不能是纯数字'
  }
  
  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(newPassword.value)) {
    return '密码必须包含英文字母'
  }
  
  // 检查是否包含数字
  if (!/\d/.test(newPassword.value)) {
    return '密码必须包含数字'
  }
  
  return ''
}

const toggleMode = () => {
  error.value = ''
  successMsg.value = ''
  name.value = ''
  password.value = ''
  email.value = ''
  code.value = ''
  codeSending.value = false
  countdown.value = 0
  removeAvatar()
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  mode.value = mode.value === 'login' ? 'register' : 'login'
  loginMethod.value = 'email'
}
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eaecef;
  box-shadow: 0 10px 30px rgba(0,0,0,0.04);
  padding: 24px 20px 20px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.card-title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 700;
  color: #1f2328;
  flex-shrink: 0;
}

.login-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  border-bottom: 1px solid #eaecef;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: #6a737d;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.tab-btn:hover {
  color: #409eff;
}

.form-item { margin-bottom: 14px; }
.form-item label {
  display: block;
  font-size: 13px;
  color: #6a737d;
  margin-bottom: 6px;
}
input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d0d7de;
  background: #fff;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
  box-sizing: border-box;
}
input:focus { border-color: #409eff; box-shadow: 0 0 0 3px rgba(64,158,255,.15); }

.code-input-row {
  display: flex;
  gap: 10px;
}

.code-input {
  flex: 1;
}

.send-code-btn {
  white-space: nowrap;
  min-width: 120px;
  background: #f0f0f0;
  color: #333;
}

.send-code-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.send-code-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform .05s ease, box-shadow .2s;
}
.btn:active { transform: translateY(1px); }
.primary {
  background: #409eff;
  color: #fff;
  box-shadow: 0 6px 18px rgba(64,158,255,.25);
  width: 100%;
}
.primary:hover { filter: brightness(1.03); }

.muted { margin-top: 10px; font-size: 13px; }
.muted a { color: #409eff; text-decoration: none; }
.muted a:hover { text-decoration: underline; }

/* 登录模式下的链接行：水平排列 */
.login-links-row {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  flex-shrink: 0;
}

.login-link {
  color: #409eff;
  text-decoration: none;
}

.login-link:hover {
  text-decoration: underline;
}

.msg { margin-top: 8px; font-size: 13px; }
.err { color: #d03050; }
.ok { color: #2f9e44; }

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #6a737d;
  line-height: 1.4;
}

.required {
  color: #d03050;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 2px solid #eaecef;
  position: relative;
  cursor: pointer;
}

.remove-avatar {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #d03050;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-upload-btn {
  padding: 8px 16px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f6f8fa;
  cursor: pointer;
  font-size: 13px;
  color: #24292f;
  display: inline-block;
}

.avatar-upload-btn:hover {
  background: #eaecef;
}

.forget-password-link {
  margin-top: 8px;
  text-align: right;
}

.forget-password-link a {
  color: #409eff;
  text-decoration: none;
  font-size: 13px;
}

.forget-password-link a:hover {
  text-decoration: underline;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eaecef;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.modal-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 24px;
  color: #6a737d;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close-btn:hover {
  color: #24292f;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #eaecef;
}

.modal-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}

.cancel-btn {
  background: #f6f8fa;
  color: #24292f;
}

.cancel-btn:hover {
  background: #eaecef;
}

.confirm-btn {
  background: #409eff;
  color: #fff;
}

.confirm-btn:hover {
  background: #337ecc;
}

.input-error {
  border-color: #d03050 !important;
}

.form-error {
  margin-top: 6px;
  font-size: 12px;
  color: #d03050;
  line-height: 1.4;
}

/* 新增样式：滚动表单容器 */
.scrollable-form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scrollable-form {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px; /* 为滚动条留出空间 */
  margin-right: -4px; /* 补偿padding-right，保持布局不变 */
}

/* 自定义滚动条样式 */
.scrollable-form::-webkit-scrollbar {
  width: 6px;
}

.scrollable-form::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.scrollable-form::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.scrollable-form::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 已保存账户列表样式 */
.saved-accounts {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eaecef;
  flex-shrink: 0;
}

.saved-accounts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.saved-accounts-title {
  font-size: 13px;
  color: #6a737d;
  font-weight: 500;
}

.expand-toggle-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6a737d;
  transition: all 0.2s;
  border-radius: 4px;
}

.expand-toggle-btn:hover {
  color: #409eff;
  background: #f6f8fa;
}

.expand-icon {
  font-size: 12px;
  transition: transform 0.2s;
  display: inline-block;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.saved-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.saved-account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #eaecef;
  border-radius: 8px;
  background: #f6f8fa;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.saved-account-item:hover {
  background: #eaecef;
  border-color: #409eff;
}

.saved-account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #d0d7de;
  display: flex;
  align-items: center;
  justify-content: center;
}

.saved-account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
}

.saved-account-info {
  flex: 1;
  min-width: 0;
}

.saved-account-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2328;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-account-email {
  font-size: 12px;
  color: #6a737d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-account-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: #6a737d;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  opacity: 0.6;
}

.remove-account-btn:hover {
  background: #d03050;
  color: #fff;
  opacity: 1;
}
</style>


