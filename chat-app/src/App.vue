<template>
  <div class="app-root">
    <div class="app-container">
      <Login v-if="!user" @login-success="onLoginSuccess" />
      <ChatRoom v-else :user="user" @logout="onLogout" @update-user="onUpdateUser" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Login from './components/Login.vue'
import ChatRoom from './components/ChatRoom.vue'

const user = ref(null)

function onLoginSuccess(u) {
  user.value = u
  if (window.electronAPI?.notifyLogin) {
    try {
      window.electronAPI.notifyLogin()
    } catch (e) {
      console.warn('notifyLogin 调用失败:', e)
    }
  }
}
function onLogout() {
  user.value = null
  if (window.electronAPI?.notifyLogout) {
    try {
      window.electronAPI.notifyLogout()
    } catch (e) {
      console.warn('notifyLogout 调用失败:', e)
    }
  }
}

function onUpdateUser(updatedUser) {
  user.value = updatedUser
}
</script>

<style scoped>
.app-root {
  height: 100vh;
  width: 100vw;
  background: linear-gradient(180deg, #f4f7fb 0%, #eef2f6 100%);
  overflow: hidden;
}
.app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
