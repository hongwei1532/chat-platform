const { RespServerErr } = require('../../model/error');
const { RespError, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');
const { parseFileSize } = require('../../utils/format');

module.exports = {
    GetFavorites,
    AddFavorite,
    RemoveFavorite
};

/**
 * 获取收藏列表
 */
async function GetFavorites(req, res) {
    const userId = req.user.id
    const { type } = req.query // 可选：all, image, file, message
    
    try {
        // 关联查询消息表和聊天信息
        let sql = `SELECT f.*, m.room,
                   CASE 
                       WHEN gc.id IS NOT NULL THEN gc.name
                       ELSE ''
                   END as chat_title,
                   CASE 
                       WHEN gc.id IS NOT NULL THEN 'group'
                       WHEN f_private.id IS NOT NULL THEN 'private'
                       ELSE NULL
                   END as chat_type
                   FROM favorite f
                   LEFT JOIN message m ON f.message_id = m.id
                   LEFT JOIN group_chat gc ON m.room = gc.room
                   LEFT JOIN friend f_private ON m.room = f_private.room AND f_private.user_id = ?
                   WHERE f.user_id = ?`
        const params = [userId, userId]
        
        if (type && type !== 'all') {
            sql += ` AND f.type = ?`
            params.push(type)
        }
        
        sql += ` ORDER BY f.created_at DESC`
        
        const { err, results } = await Query(sql, params)
        
        if (err) {
            console.error('查询收藏列表失败:', err)
            return RespError(res, RespServerErr)
        }
        
        // 处理私聊的聊天标题（需要根据当前用户视角确定显示名称）
        if (results && results.length > 0) {
            for (let item of results) {
                if (item.chat_type === 'private' && item.room) {
                    // 查询私聊的另一方用户ID（friend表中同一个room有两条记录，一条是当前用户，一条是对方用户）
                    const roomSql = `SELECT user_id FROM friend WHERE room = ? AND user_id != ? LIMIT 1`
                    const roomResult = await Query(roomSql, [item.room, userId])
                    
                    if (!roomResult.err && roomResult.results && roomResult.results.length > 0) {
                        const otherUserId = roomResult.results[0].user_id
                        
                        // 查询当前用户对对方用户的备注
                        const remarkSql = `SELECT remark FROM friend WHERE room = ? AND user_id = ? LIMIT 1`
                        const remarkResult = await Query(remarkSql, [item.room, userId])
                        
                        // 查询对方用户的详细信息
                        const userSql = `SELECT name, username FROM user WHERE id = ?`
                        const userResult = await Query(userSql, [otherUserId])
                        
                        if (!userResult.err && userResult.results && userResult.results.length > 0) {
                            const userInfo = userResult.results[0]
                            // 获取备注（如果存在）
                            const remark = remarkResult.results && remarkResult.results.length > 0 
                                ? remarkResult.results[0].remark 
                                : null
                            
                            // 优先使用备注，如果没有备注则使用昵称，最后使用用户名
                            item.chat_title = remark && remark.trim() && remark !== userInfo.username
                                ? remark
                                : (userInfo.name || userInfo.username || '')
                        }
                    }
                }
            }
        }
        
        return RespData(res, results || [])
    } catch (e) {
        console.error('获取收藏列表失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 添加收藏
 */
async function AddFavorite(req, res) {
    const { message_id, type, content, file_size } = req.body
    const userId = req.user.id
    
    if (!message_id || !type || !content) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 验证类型
    if (!['image', 'file', 'message'].includes(type)) {
        return RespError(res, { code: 4002, message: '收藏类型有误' })
    }
    
    try {
        // 检查是否已经收藏过
        let sql = `SELECT id FROM favorite WHERE user_id = ? AND message_id = ?`
        const checkResult = await Query(sql, [userId, message_id])
        
        if (checkResult.err) {
            console.error('检查收藏失败:', checkResult.err)
            return RespError(res, RespServerErr)
        }
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespError(res, { code: 4003, message: '该消息已收藏' })
        }
        
        // 处理文件大小：如果是字符串格式（如 '194.23KB'），转换为字节数
        let fileSizeBytes = 0
        if (file_size) {
            if (typeof file_size === 'string') {
                // 解析格式化字符串转换为字节数
                fileSizeBytes = parseFileSize(file_size)
            } else if (typeof file_size === 'number') {
                fileSizeBytes = file_size
            }
        }
        
        // 插入收藏记录
        sql = `INSERT INTO favorite (user_id, message_id, type, content, file_size) VALUES (?, ?, ?, ?, ?)`
        const insertResult = await Query(sql, [userId, message_id, type, content, fileSizeBytes])
        
        if (insertResult.err) {
            console.error('添加收藏失败:', insertResult.err)
            return RespError(res, RespServerErr)
        }
        
        return RespData(res, { 
            id: insertResult.results.insertId,
            message: '收藏成功'
        })
    } catch (e) {
        console.error('添加收藏失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 取消收藏
 */
async function RemoveFavorite(req, res) {
    const { favorite_id } = req.body
    const userId = req.user.id
    
    if (!favorite_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 检查收藏是否存在且属于当前用户
        let sql = `SELECT id FROM favorite WHERE id = ? AND user_id = ?`
        const checkResult = await Query(sql, [favorite_id, userId])
        
        if (checkResult.err) {
            console.error('检查收藏失败:', checkResult.err)
            return RespError(res, RespServerErr)
        }
        
        if (!checkResult.results || checkResult.results.length === 0) {
            return RespError(res, { code: 4004, message: '收藏不存在' })
        }
        
        // 删除收藏
        sql = `DELETE FROM favorite WHERE id = ? AND user_id = ?`
        const deleteResult = await Query(sql, [favorite_id, userId])
        
        if (deleteResult.err) {
            console.error('取消收藏失败:', deleteResult.err)
            return RespError(res, RespServerErr)
        }
        
        return RespData(res, { message: '取消收藏成功' })
    } catch (e) {
        console.error('取消收藏失败:', e)
        return RespError(res, RespServerErr)
    }
}

