// 密码验证工具
/**
 * 验证密码是否符合要求
 * 要求：8-16位，英文字母+数字+字符组合，不能是纯数字
 * @param {string} password - 密码
 * @returns {object} - { valid: boolean, message: string }
 */
function validatePassword(password) {
  if (!password) {
    return { valid: false, message: '密码不能为空' };
  }

  // 检查长度
  if (password.length < 8 || password.length > 16) {
    return { valid: false, message: '密码长度必须在8-16位之间' };
  }

  // 检查是否是纯数字
  if (/^\d+$/.test(password)) {
    return { valid: false, message: '密码不能是纯数字' };
  }

  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含英文字母' };
  }

  // 检查是否包含数字
  if (!/\d/.test(password)) {
    return { valid: false, message: '密码必须包含数字' };
  }

  // 检查是否包含特殊字符（可选，但建议包含）
  // 这里我们要求至少包含字母和数字，特殊字符可选
  // 如果需要强制要求特殊字符，可以取消下面的注释
  // if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
  //   return { valid: false, message: '密码必须包含特殊字符' };
  // }

  return { valid: true, message: '密码格式正确' };
}

module.exports = {
  validatePassword
};

