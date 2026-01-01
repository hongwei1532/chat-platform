// 验证码管理模块
// 使用内存存储验证码（生产环境建议使用Redis）

const verificationCodes = new Map(); // email -> { code, expiresAt, attempts, createdAt }

// 验证码有效期（毫秒）
const CODE_EXPIRE_TIME = 10 * 60 * 1000; // 10分钟

// 最大尝试次数
const MAX_ATTEMPTS = 5;

/**
 * 生成6位数字验证码
 */
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 存储验证码
 * @param {string} email - 邮箱
 * @returns {string} - 验证码
 */
function storeCode(email) {
  const code = generateCode();
  const now = Date.now();
  const expiresAt = now + CODE_EXPIRE_TIME;
  
  verificationCodes.set(email, {
    code,
    expiresAt,
    attempts: 0,
    createdAt: now
  });

  // 设置过期清理
  setTimeout(() => {
    verificationCodes.delete(email);
  }, CODE_EXPIRE_TIME);

  return code;
}

/**
 * 验证验证码
 * @param {string} email - 邮箱
 * @param {string} inputCode - 用户输入的验证码
 * @returns {object} - { valid: boolean, message: string }
 */
function verifyCode(email, inputCode) {
  const stored = verificationCodes.get(email);

  if (!stored) {
    return { valid: false, message: '验证码不存在或已过期，请重新获取' };
  }

  // 检查是否过期
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email);
    return { valid: false, message: '验证码已过期，请重新获取' };
  }

  // 检查尝试次数
  if (stored.attempts >= MAX_ATTEMPTS) {
    verificationCodes.delete(email);
    return { valid: false, message: '验证码尝试次数过多，请重新获取' };
  }

  // 验证码错误
  if (stored.code !== inputCode) {
    stored.attempts++;
    return { valid: false, message: `验证码错误，还可尝试 ${MAX_ATTEMPTS - stored.attempts} 次` };
  }

  // 验证成功，删除验证码
  verificationCodes.delete(email);
  return { valid: true, message: '验证成功' };
}

/**
 * 删除验证码（用于验证成功后清理）
 */
function deleteCode(email) {
  verificationCodes.delete(email);
}

/**
 * 检查邮箱是否已有验证码（用于限制发送频率）
 * 如果验证码存在且未过期，返回true（表示不能发送新验证码）
 */
function hasCode(email) {
  const stored = verificationCodes.get(email);
  if (!stored) return false;
  
  // 如果验证码已过期，返回false（可以发送新验证码）
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email);
    return false;
  }
  
  // 检查是否在60秒内（限制发送频率）
  const timeSinceCreation = Date.now() - stored.createdAt;
  if (timeSinceCreation < 60 * 1000) {
    return true; // 60秒内不能重复发送
  }
  
  return false;
}

module.exports = {
  storeCode,
  verifyCode,
  deleteCode,
  hasCode
};

