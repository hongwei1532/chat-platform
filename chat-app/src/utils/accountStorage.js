// 账户信息存储管理工具
const STORAGE_KEY = 'saved_accounts'
const EXPIRY_DAYS = 7 // 7天过期

/**
 * 获取所有已保存的账户
 */
export function getSavedAccounts() {
  try {
    const accountsStr = localStorage.getItem(STORAGE_KEY)
    if (!accountsStr) return []
    
    const accounts = JSON.parse(accountsStr)
    // 清理过期账户
    const now = Date.now()
    const validAccounts = accounts.filter(account => {
      const lastLoginTime = account.lastLoginTime || 0
      const daysSinceLogin = (now - lastLoginTime) / (1000 * 60 * 60 * 24)
      return daysSinceLogin < EXPIRY_DAYS
    })
    
    // 先通过email去重，确保每个email只有一个账户（保留最新的）
    const emailMap = new Map()
    const emailDeduplicatedAccounts = []
    for (const account of validAccounts) {
      if (account.email) {
        if (!emailMap.has(account.email)) {
          emailMap.set(account.email, account)
          emailDeduplicatedAccounts.push(account)
        } else {
          // 如果email已存在，保留最新的（lastLoginTime更大的）
          const existing = emailMap.get(account.email)
          if (account.lastLoginTime > (existing.lastLoginTime || 0)) {
            const index = emailDeduplicatedAccounts.findIndex(acc => acc === existing)
            if (index >= 0) {
              emailDeduplicatedAccounts[index] = account
              emailMap.set(account.email, account)
            }
          }
        }
      } else {
        // 没有email的账户，先保留
        emailDeduplicatedAccounts.push(account)
      }
    }
    
    // 再通过name去重：如果有相同name的账户，只保留有email的那个
    const nameMap = new Map()
    const finalAccounts = []
    
    for (const account of emailDeduplicatedAccounts) {
      const name = account.name || ''
      if (name && nameMap.has(name)) {
        const existingAccount = nameMap.get(name)
        // 如果当前账户有email，而已存在的账户没有email，替换
        if (account.email && !existingAccount.email) {
          const index = finalAccounts.findIndex(acc => acc === existingAccount)
          if (index >= 0) {
            finalAccounts[index] = account
            nameMap.set(name, account)
          }
        }
        // 如果两个都有email，保留第一个（因为已经通过email去重了，这种情况不应该发生）
        // 如果两个都没有email，保留第一个
      } else {
        if (name) {
          nameMap.set(name, account)
        }
        finalAccounts.push(account)
      }
    }
    
    // 如果有账户被清理或去重，更新存储
    if (finalAccounts.length !== accounts.length) {
      saveAccounts(finalAccounts)
    }
    
    return finalAccounts
  } catch (e) {
    console.error('获取已保存账户失败:', e)
    return []
  }
}

/**
 * 保存账户信息
 */
export function saveAccount(accountInfo) {
  try {
    const accounts = getSavedAccounts()
    const { email, avatar, name, token } = accountInfo
    
    // 检查是否已存在该邮箱的账户
    const existingIndex = accounts.findIndex(acc => acc.email === email)
    
    const accountData = {
      email,
      avatar: avatar || '',
      name: name || '',
      token: token || '',
      lastLoginTime: Date.now()
    }
    
    if (existingIndex >= 0) {
      // 更新已存在的账户
      accounts[existingIndex] = accountData
    } else {
      // 添加新账户
      accounts.push(accountData)
    }
    
    saveAccounts(accounts)
    return true
  } catch (e) {
    console.error('保存账户失败:', e)
    return false
  }
}

/**
 * 保存账户列表
 */
function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
  } catch (e) {
    console.error('保存账户列表失败:', e)
  }
}

/**
 * 删除账户
 */
export function removeAccount(email) {
  try {
    const accounts = getSavedAccounts()
    const filtered = accounts.filter(acc => acc.email !== email)
    saveAccounts(filtered)
    return true
  } catch (e) {
    console.error('删除账户失败:', e)
    return false
  }
}

/**
 * 根据邮箱获取账户信息
 */
export function getAccountByEmail(email) {
  const accounts = getSavedAccounts()
  return accounts.find(acc => acc.email === email) || null
}

/**
 * 清理所有过期账户
 */
export function cleanExpiredAccounts() {
  const accounts = getSavedAccounts() // 这个函数内部已经会清理过期账户
  return accounts
}

