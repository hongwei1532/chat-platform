const express = require('express');
const router = express.Router();
const deepseek = require("../container/deepseek/index");
const { authenticateToken } = require('../middleware/auth');

// WebSocket路由需要单独导出函数
module.exports = function () {
    // HTTP 接口：非流式聊天
    router.post('/chat', authenticateToken, deepseek.chat);
    
    // WebSocket 接口：流式聊天
    router.ws('/chat-stream', deepseek.chatStream);
    
    return router;
}

