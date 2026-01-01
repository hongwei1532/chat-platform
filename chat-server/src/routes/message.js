const express = require('express');
const router = express.Router();
const message = require("../container/message/index")
const { authenticateToken } = require('../middleware/auth');

router.get('/list', authenticateToken, message.List)
router.get('/search-history', authenticateToken, message.SearchChatHistory)
router.post('/recall', authenticateToken, message.RecallMessage)
router.post('/delete', authenticateToken, message.DeleteMessage)
router.post('/delete-chat', authenticateToken, message.DeleteChat)
router.post('/pin', authenticateToken, message.PinChat)
router.post('/unpin', authenticateToken, message.UnpinChat)
router.post('/mute', authenticateToken, message.MuteChat)
router.post('/unmute', authenticateToken, message.UnmuteChat)
router.post('/forward', authenticateToken, message.ForwardMessage)
router.post('/forward-multiple', authenticateToken, message.ForwardMultiple)
router.post('/mark-mention-read', authenticateToken, message.MarkMentionRead)

// WebSocket路由需要单独导出函数
module.exports = function () {
    router.get('/list', authenticateToken, message.List)
    router.get('/search-history', authenticateToken, message.SearchChatHistory)
    router.post('/recall', authenticateToken, message.RecallMessage)
    router.post('/delete', authenticateToken, message.DeleteMessage)
    router.post('/delete-chat', authenticateToken, message.DeleteChat)
    router.post('/pin', authenticateToken, message.PinChat)
    router.post('/unpin', authenticateToken, message.UnpinChat)
    router.post('/mute', authenticateToken, message.MuteChat)
    router.post('/unmute', authenticateToken, message.UnmuteChat)
    router.post('/forward', authenticateToken, message.ForwardMessage)
    router.post('/forward-multiple', authenticateToken, message.ForwardMultiple)
    router.post('/mark-mention-read', authenticateToken, message.MarkMentionRead)
    router.ws('/chat', message.ChatConnect)
    return router
}

