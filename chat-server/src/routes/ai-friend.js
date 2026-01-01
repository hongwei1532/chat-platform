const express = require('express');
const router = express.Router();
const aiFriend = require("../container/ai-friend/index");
const { authenticateToken } = require('../middleware/auth');

// WebSocket路由需要单独导出函数
module.exports = function () {
    // HTTP 接口
    router.get('/', authenticateToken, aiFriend.GetAIFriend);
    router.post('/', authenticateToken, aiFriend.CreateOrUpdateAIFriend);
    router.get('/history', authenticateToken, aiFriend.GetAIMessageHistory);
    router.put('/settings', authenticateToken, aiFriend.UpdateAIFriendSettings);
    router.post('/clear-context', authenticateToken, aiFriend.ClearAIFriendContext);
    
    // WebSocket 接口：AI好友聊天（流式）
    router.ws('/chat-stream', (ws, req) => {
        // WebSocket的token验证在SendAIMessage中处理
        aiFriend.SendAIMessage(ws, req);
    });
    
    return router;
}

