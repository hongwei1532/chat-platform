<template>
  <div>
    <div class="bar">
      <button @click="logout" class="btn ghost">退出登录</button>
    </div>

    <div class="card">
      <h2 class="card-title">留言板</h2>
      <form class="form" @submit.prevent="submitMessage">
        <div class="form-item">
          <label>标题</label>
          <input v-model="title" required maxlength="20" placeholder="请输入标题" />
        </div>
        <div class="form-item">
          <label>内容</label>
          <textarea v-model="content" required maxlength="500" placeholder="写点什么吧…"></textarea>
        </div>
        <button class="btn primary" type="submit">发布留言</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 class="sub-title">留言列表</h3>
      <div v-if="messagesList.length === 0" class="empty">暂无留言</div>
      <ul class="list">
        <li v-for="msg in messagesList" :key="msg.id" class="item">
          <div class="item-head">
            <strong class="item-title">{{ msg.title }}</strong>
            <span class="item-meta">{{ msg.Username }} · {{ formatTime(msg.date) }}</span>
          </div>
          <p class="item-content">{{ msg.content }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { messages, setApiBaseUrl } from '../api/client'

const emits = defineEmits(['logout'])

const props = defineProps({ user: Object })
const messagesList = ref([])
const title = ref('')
const content = ref('')

onMounted(async () => {
  // 从 Electron 获取 API 地址
  if (window.electronAPI?.getApiUrl) {
    const apiUrl = await window.electronAPI.getApiUrl()
    setApiBaseUrl(apiUrl)
  } else if (window.API_BASE_URL) {
    setApiBaseUrl(window.API_BASE_URL)
  }
  await getMessages()
})

const getMessages = async () => {
  const data = await messages.getList()
  if (data.success) {
    messagesList.value = data.messages
  }
}

const submitMessage = async () => {
  if (!props.user) {
    alert('请先登录')
    return
  }
  const data = await messages.create(title.value, content.value)
  if (data.success) {
    title.value = ''
    content.value = ''
    await getMessages()
  } else {
    alert(data.message || '发布失败')
  }
}

const logout = () => { emits('logout') }

function formatTime(t) {
  try {
    const d = new Date(t)
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const dd = String(d.getDate()).padStart(2,'0')
    const hh = String(d.getHours()).padStart(2,'0')
    const mm = String(d.getMinutes()).padStart(2,'0')
    return `${y}-${m}-${dd} ${hh}:${mm}`
  } catch (_) {
    return t
  }
}
</script>

<style scoped>
.bar { display: flex; justify-content: flex-end; margin-bottom: 12px; }

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eaecef;
  box-shadow: 0 10px 30px rgba(0,0,0,0.04);
  padding: 20px;
}
.card-title { margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #1f2328; }
.sub-title { margin: 0 0 10px; font-size: 18px; font-weight: 600; color: #1f2328; }

.form-item { margin-bottom: 12px; }
.form-item label { display: block; font-size: 13px; color: #6a737d; margin-bottom: 6px; }
input, textarea {
  width: 100%;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}
input { height: 38px; padding: 0 12px; }
textarea { min-height: 88px; padding: 10px 12px; resize: vertical; }
input:focus, textarea:focus { border-color: #409eff; box-shadow: 0 0 0 3px rgba(64,158,255,.15); }

.btn { height: 38px; padding: 0 16px; border: none; border-radius: 8px; cursor: pointer; }
.primary { background: #409eff; color: #fff; box-shadow: 0 6px 18px rgba(64,158,255,.25); }
.ghost { background: #fff; border: 1px solid #d0d7de; color: #1f2328; }

.list { list-style: none; padding: 0; margin: 0; }
.item { border-top: 1px solid #f0f2f4; padding: 12px 2px; }
.item:first-child { border-top: none; }
.item-head { display: flex; align-items: baseline; gap: 10px; }
.item-title { font-size: 16px; color: #1f2328; }
.item-meta { font-size: 12px; color: #6a737d; }
.item-content { margin: 6px 0 0; color: #24292f; line-height: 1.6; }

.empty { color: #6a737d; padding: 8px 0; }
</style>
