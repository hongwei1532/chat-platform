// 随机用户名生成工具
const crypto = require('crypto');

/**
 * 生成随机用户名
 * 要求：6-20个字符，不能有特殊字符（只包含字母和数字）
 * @returns {string} - 随机用户名
 */
function generateUsername() {
  // 使用字母和数字的组合
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * (20 - 6 + 1)) + 6; // 6-20之间的随机长度
  
  let username = '';
  // 确保第一个字符是字母（不是数字）
  username += chars.charAt(Math.floor(Math.random() * 52)); // 前52个字符是字母
  
  // 生成剩余字符
  for (let i = 1; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return username;
}

/**
 * 检查用户名是否已存在
 * @param {string} username - 用户名
 * @param {Function} queryFunc - 查询函数
 * @returns {Promise<boolean>} - 是否存在
 */
async function isUsernameExists(username, queryFunc) {
  try {
    const sql = 'SELECT id FROM user WHERE username=?';
    const result = await queryFunc(sql, [username]);
    return result.results && result.results.length > 0;
  } catch (error) {
    console.error('检查用户名是否存在失败:', error);
    return false;
  }
}

/**
 * 生成唯一的用户名
 * @param {Function} queryFunc - 查询函数
 * @param {number} maxAttempts - 最大尝试次数，默认10
 * @returns {Promise<string>} - 唯一的用户名
 */
async function generateUniqueUsername(queryFunc, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const username = generateUsername();
    const exists = await isUsernameExists(username, queryFunc);
    if (!exists) {
      return username;
    }
  }
  
  // 如果10次都重复，添加时间戳确保唯一性
  const baseUsername = generateUsername();
  const timestamp = Date.now().toString().slice(-6); // 取时间戳后6位
  return baseUsername.slice(0, 14) + timestamp; // 确保总长度不超过20
}

module.exports = {
  generateUsername,
  generateUniqueUsername,
  isUsernameExists
};

