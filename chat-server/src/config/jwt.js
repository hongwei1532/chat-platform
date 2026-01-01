// JWT配置模块 - 确保所有地方使用相同的secret key
const jwt = require('jsonwebtoken');

// 默认secret key
const DEFAULT_SECRET_KEY = 'xWbiNA3FqnK77MnVCj5CAcfA-VlXj7xoQLd1QaAme6l_t0Yp1TdHbSw';

// 获取secret key（优先使用环境变量，否则使用默认值）
const getSecretKey = () => {
  const secretKey = process.env.JWT_SECRET || DEFAULT_SECRET_KEY;
  return secretKey;
};

// 导出secret key（每次访问都获取最新值）
Object.defineProperty(module.exports, 'secretKey', {
  get: () => getSecretKey(),
  enumerable: true,
  configurable: true
});

// 导出JWT相关函数
module.exports.sign = (payload, options = {}) => {
  return jwt.sign(payload, getSecretKey(), options);
};

module.exports.verify = (token, callback) => {
  return jwt.verify(token, getSecretKey(), callback);
};

module.exports.verifySync = (token) => {
  try {
    return jwt.verify(token, getSecretKey());
  } catch (err) {
    throw err;
  }
};

module.exports.decode = (token, options = {}) => {
  return jwt.decode(token, options);
};

// 启动时打印secret key信息（用于调试）
const secretKey = getSecretKey();
console.log('JWT配置初始化 - SecretKey前10字符:', secretKey.substring(0, 10) + '...', '长度:', secretKey.length);
console.log('JWT配置初始化 - 使用环境变量:', !!process.env.JWT_SECRET);
if (process.env.JWT_SECRET) {
  console.log('JWT配置初始化 - 环境变量JWT_SECRET已设置');
}

