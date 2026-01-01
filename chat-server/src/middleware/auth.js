const jwt = require('jsonwebtoken');
const { secretKey, verify } = require('../config/jwt');
const { RespTokenErr } = require('../model/error');
const { RespError } = require('../model/resp');

// JWT 校验中间件
function authenticateToken(req, res, next) {
    // 获取 JWT 字符串
    let token = req.headers.authorization;
    
    if (!token) {
        // 如果没有 JWT，则返回 401 Unauthorized
        return RespError(res, RespTokenErr)
    }
    
    // 处理 Bearer token 格式（如果存在）
    if (token.startsWith('Bearer ')) {
        token = token.slice(7);
    }
    
    // 去除首尾空格
    token = token.trim();

    // 验证 JWT
    verify(token, (err, decoded) => {
        if (err) {
            // JWT 验证失败，打印详细错误信息（开发环境）
            if (process.env.NODE_ENV !== 'production') {
                console.error('JWT验证失败:', err.message);
                console.error('Token前20字符:', token.substring(0, 20) + '...');
                console.error('Token长度:', token.length);
                console.error('使用的SecretKey:', secretKey.substring(0, 10) + '...');
                
                // 尝试解码token（不验证签名）看看payload是什么
                try {
                    const jwt = require('jsonwebtoken');
                    const decodedWithoutVerify = jwt.decode(token, { complete: true });
                    if (decodedWithoutVerify) {
                        console.error('Token payload:', decodedWithoutVerify.payload);
                    }
                } catch (decodeErr) {
                    console.error('无法解码token:', decodeErr.message);
                }
            }
            return RespError(res, RespTokenErr)
        } else {
            // JWT 验证成功，将 JWT 中的信息存储在请求对象中，并调用 next() 继续处理请求
            req.user = decoded;
            next();
        }
    });
}

module.exports = {
    authenticateToken
};
