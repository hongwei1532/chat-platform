const { RespError, RespData } = require('../../model/resp');
const { RespServerErr } = require('../../model/error');
const { Query } = require('../../db/query');
const messageModule = require('../message/index');

/**
 * 更新群公告
 */
async function UpdateAnnouncement(req, res) {
    const { group_id, announcement } = req.body
    const user_id = req.user.id
    
    if (!group_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 检查是否是群主或管理员
    const creator_id = results[0].creator_id
    if (user_id !== creator_id) {
        sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
        const adminCheck = await Query(sql, [group_id, user_id])
        if (adminCheck.err) return RespError(res, RespServerErr)
        if (!adminCheck.results || adminCheck.results.length === 0) {
            return RespError(res, { code: 4003, message: '你不是群主或管理员，无法进行操作' })
        }
    }
    
    // 更新群公告
    sql = 'UPDATE group_chat SET announcement=? WHERE id=?'
    const updateResp = await Query(sql, [announcement || null, group_id])
    if (updateResp.err) return RespError(res, RespServerErr)
    
    return RespData(res, { announcement: announcement || null })
}

/**
 * 发布群公告（发送消息到聊天区）
 */
async function PublishAnnouncement(req, res) {
    const { group_id } = req.body
    const user_id = req.user.id
    
    if (!group_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在并获取群公告
    let sql = 'SELECT creator_id, room, announcement FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    const room = results[0].room
    const announcement = results[0].announcement
    
    if (!announcement || !announcement.trim()) {
        return RespError(res, { code: 4004, message: '群公告内容为空，无法发布' })
    }
    
    // 检查是否是群主或管理员
    const creator_id = results[0].creator_id
    if (user_id !== creator_id) {
        sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
        const adminCheck = await Query(sql, [group_id, user_id])
        if (adminCheck.err) return RespError(res, RespServerErr)
        if (!adminCheck.results || adminCheck.results.length === 0) {
            return RespError(res, { code: 4003, message: '你不是群主或管理员，无法进行操作' })
        }
    }
    
    // 发送群公告消息：格式为"群公告\nxxx"
    // 统一处理换行符：将 \r\n 转换为 \n，确保换行符格式一致
    const normalizedAnnouncement = String(announcement || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const messageContent = `群公告\n${normalizedAnnouncement}`
    
    const message = {
        sender_id: user_id,
        receiver_id: group_id,
        type: 'group',
        media_type: 'text',
        content: messageContent,
        room: room,
        file_size: 0,
        status: 0
    }
    
    sql = 'INSERT INTO message SET ?'
    const insertResult = await Query(sql, message)
    if (insertResult.err) return RespError(res, RespServerErr)
    
    const messageId = insertResult.results.insertId
    
    // 标记发送者为已读
    sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
    await Query(sql, [messageId, user_id])
    
    // 更新消息统计
    sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
    await Query(sql, [room])
    
    // 通过WebSocket广播消息给所有群成员
    const rooms = messageModule.rooms
    if (rooms && rooms[room]) {
        // 获取发送者的显示信息
        sql = `SELECT gm.nickname as group_nickname, u.name, u.username, u.avatar
               FROM group_members gm
               LEFT JOIN user u ON u.id = gm.user_id
               WHERE gm.group_id = ? AND gm.user_id = ?
               LIMIT 1`
        const senderInfoResp = await Query(sql, [group_id, user_id])
        let senderGroupNickname = null
        let senderName = null
        let senderUsername = null
        let senderAvatar = null
        if (senderInfoResp.results && senderInfoResp.results.length > 0) {
            senderGroupNickname = senderInfoResp.results[0].group_nickname
            senderName = senderInfoResp.results[0].name
            senderUsername = senderInfoResp.results[0].username
            senderAvatar = senderInfoResp.results[0].avatar
        }
        
        const notification = {
            id: messageId,
            sender_id: user_id,
            receiver_id: group_id,
            content: messageContent,
            room: room,
            type: 'group',
            media_type: 'text',
            created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            is_recalled: 0,
            nickname: senderGroupNickname || senderName || senderUsername || '用户',
            name: senderName || senderUsername || '用户',
            username: senderUsername || '',
            avatar: senderAvatar || ''
        }
        
        // 广播给房间内所有在线用户
        for (const userId in rooms[room]) {
            if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                rooms[room][userId].send(JSON.stringify(notification))
            }
        }
    }
    
    return RespData(res, { message_id: messageId })
}

module.exports = {
    UpdateAnnouncement,
    PublishAnnouncement
};

