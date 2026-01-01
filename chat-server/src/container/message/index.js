const path = require('path');
const { RespServerErr } = require('../../model/error');
const { RespError, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');
const fs = require('fs');
const { generateRandomString, notExitCreate } = require('../../utils/utils')
const { formatBytes } = require('../../utils/format')

let rooms = {}

module.exports = {
    List,
    ChatConnect,
    RecallMessage,
    DeleteMessage,
    DeleteChat,
    PinChat,
    UnpinChat,
    MuteChat,
    UnmuteChat,
    ForwardMessage,
    ForwardMultiple,
    SearchChatHistory,
    MarkMentionRead,
    rooms // 导出rooms对象，供其他模块使用
};

/**
 * 解析消息中的@信息
 * @param {string} content - 消息内容
 * @param {string} room - 房间号
 * @param {number} senderId - 发送者ID
 * @returns {Object} { mentionedUsers: number[], mentionAll: boolean }
 */
async function parseMentions(content, room, senderId) {
    const mentionedUsers = []
    let mentionAll = false
    
    if (!content || typeof content !== 'string') {
        return { mentionedUsers, mentionAll }
    }
    
    // 检查是否@所有人
    if (content.includes('@所有人')) {
        mentionAll = true
    }
    
    // 解析@用户（格式：@用户名）
    // 匹配@后面跟着非空格、非@的字符，直到遇到空格或字符串结束
    const mentionRegex = /@([^@\s]+)/g
    let match
    
    // 获取群聊ID
    let sql = `SELECT id FROM group_chat WHERE room=?`
    const groupResp = await Query(sql, [room])
    if (groupResp.err || !groupResp.results || groupResp.results.length === 0) {
        return { mentionedUsers, mentionAll }
    }
    const groupId = groupResp.results[0].id
    
    // 获取所有群成员及其显示名称
    sql = `SELECT gm.user_id, gm.nickname, u.name, u.username,
                  (SELECT f.remark 
                   FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = gm.user_id AND fg.user_id = ?
                   LIMIT 1) as friend_remark
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ?`
    
    // 这里需要当前用户ID来查询好友备注，但我们没有，所以先查询所有成员
    // 实际上，我们需要根据发送者的视角来解析@，所以应该用发送者的ID
    sql = `SELECT gm.user_id, gm.nickname, u.name, u.username,
                  (SELECT f.remark 
                   FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = gm.user_id AND fg.user_id = ?
                   LIMIT 1) as friend_remark
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ?`
    const membersResp = await Query(sql, [senderId, groupId])
    
    if (membersResp.err || !membersResp.results) {
        return { mentionedUsers, mentionAll }
    }
    
    const members = membersResp.results || []
    
    // 构建显示名称到用户ID的映射
    const nameToUserIdMap = new Map()
    
    members.forEach(member => {
        if (member.user_id === senderId) return // 排除发送者自己
        
        // 获取显示名称（优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名）
        let groupNickname = member.nickname
        if (groupNickname && groupNickname === member.name) {
            groupNickname = null // 群聊昵称是默认值，忽略它
        }
        const friendRemark = member.friend_remark && member.friend_remark.trim() && member.friend_remark !== member.username ? member.friend_remark : null
        const displayName = groupNickname || friendRemark || member.name || member.username || '用户'
        
        // 如果显示名称不是"所有人"，添加到映射中
        if (displayName !== '所有人') {
            nameToUserIdMap.set(displayName, member.user_id)
        }
    })
    
    // 解析@用户
    while ((match = mentionRegex.exec(content)) !== null) {
        const mentionText = match[1]
        
        // 跳过"所有人"
        if (mentionText === '所有人') {
            continue
        }
        
        // 查找匹配的用户
        const userId = nameToUserIdMap.get(mentionText)
        if (userId && !mentionedUsers.includes(userId)) {
            mentionedUsers.push(userId)
        }
    }
    
    return { mentionedUsers, mentionAll }
}

/**
 * 获取消息列表
 * 1.先获取好友聊天列表
 * 2.先根据好友分组表中获取当前用户的所有好友分组id,然后根据分组id获取指定房间的用户的所有聊天记录,在根据消息统计表获取最后一次发送消息的时间
 * 3.如何根据对方id和房间号获取未读消息的数量
 * 4.根据房间号和创建时间获取最后一次消息内容
 * 5.根据房间号获取群聊历史记录
 */
async function List(req, res) {
    let data = []
    let id = req.user.id
    
    // 获取AI好友聊天列表（放在最前面）
    const aiFriendSql = `SELECT af.room, af.friend_type, msg_sta.updated_at 
                         FROM ai_friend af
                         LEFT JOIN message_statistics msg_sta ON af.room = msg_sta.room
                         WHERE af.user_id = ?
                         ORDER BY msg_sta.updated_at DESC
                         LIMIT 1`
    const { err: aiFriendErr, results: aiFriendResults } = await Query(aiFriendSql, [id])
    
    if (!aiFriendErr && aiFriendResults && aiFriendResults.length > 0) {
        const aiFriend = aiFriendResults[0]
        const aiFriendType = aiFriend.friend_type || 'warm'
        const aiFriendTypeNames = {
            warm: '温暖倾听型',
            humorous: '幽默开朗型',
            rational: '理性分析型',
            energetic: '活力鼓励型'
        }
        
        // 查询AI好友的置顶状态和免打扰状态
        let aiFriendPinned = false
        let aiFriendMuted = false
        if (aiFriend.room) {
            const pinnedSql = `SELECT room FROM pinned_chat WHERE user_id=? AND room=?`
            const pinnedResp = await Query(pinnedSql, [id, aiFriend.room])
            if (!pinnedResp.err && pinnedResp.results && pinnedResp.results.length > 0) {
                aiFriendPinned = true
            }
            
            const mutedSql = `SELECT room FROM muted_chat WHERE user_id=? AND room=?`
            const mutedResp = await Query(mutedSql, [id, aiFriend.room])
            if (!mutedResp.err && mutedResp.results && mutedResp.results.length > 0) {
                aiFriendMuted = true
            }
            
            // AI好友不显示未读消息数（始终设为0）
            const unreadCount = 0
            
            // 查询最后一条消息
            const lastMsgSql = `SELECT content, media_type, is_recalled, sender_id 
                               FROM message 
                               WHERE room = ? AND type = 'ai_friend'
                               AND id NOT IN (SELECT message_id FROM deleted_message WHERE user_id = ?)
                               ORDER BY created_at DESC LIMIT 1`
            const lastMsgResp = await Query(lastMsgSql, [aiFriend.room, id])
            
            let lastMessage = ''
            let mediaType = 'text'
            if (lastMsgResp.results && lastMsgResp.results.length > 0) {
                const lastMsg = lastMsgResp.results[0]
                if (lastMsg.is_recalled) {
                    if (lastMsg.sender_id === id) {
                        lastMessage = '你撤回了一条消息'
                    } else {
                        lastMessage = 'AI好友撤回了一条消息'
                    }
                } else if (lastMsg.media_type === 'system') {
                    // 处理系统消息
                    try {
                        const contentData = JSON.parse(lastMsg.content)
                        if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
                            lastMessage = `已将AI好友切换为${contentData.friend_type_name}`
                        } else if (contentData.type === 'ai_friend_context_cleared') {
                            lastMessage = '已清空AI好友的上下文'
                        } else {
                            lastMessage = lastMsg.content
                        }
                    } catch (e) {
                        lastMessage = lastMsg.content
                    }
                    mediaType = lastMsg.media_type
                } else {
                    lastMessage = lastMsg.content
                    mediaType = lastMsg.media_type
                }
            }
            
            // 构建AI好友聊天项
            data.push({
                room: aiFriend.room,
                name: `AI好友（${aiFriendTypeNames[aiFriendType]}）`,
                avatar: null, // AI好友没有头像，使用默认
                chat_type: 'ai_friend',
                type: 'ai_friend',
                friend_type: aiFriendType,
                lastMessage: lastMessage,
                media_type: mediaType,
                unreadCount: unreadCount,
                updated_at: aiFriend.updated_at || new Date(),
                is_pinned: aiFriendPinned ? 1 : 0,
                is_muted: aiFriendMuted ? 1 : 0,
                user_id: 0, // AI好友的user_id设为0
                group_id: null
            })
        }
    }
    
    //获取所有好友聊天列表（排除被拉黑的好友）
    // 使用 LEFT JOIN 代替 NOT EXISTS 以提高性能
    let sql = `SELECT f.user_id, f.remark, f.username as receiver_username, f.room, msg_sta.updated_at 
               FROM friend f
               INNER JOIN friend_group fg ON f.group_id = fg.id
               INNER JOIN message_statistics msg_sta ON f.room = msg_sta.room
               LEFT JOIN blocked_friend bf ON bf.blocker_id = ? AND bf.blocked_id = f.user_id
               WHERE fg.user_id = ? 
                 AND bf.id IS NULL
               ORDER BY msg_sta.updated_at DESC;`
    let { err, results } = await Query(sql, [id, id])
    
    // 批量查询所有好友的置顶状态和免打扰状态（优化性能）
    const pinnedRooms = new Set()
    const mutedRooms = new Set()
    if (results && results.length > 0) {
        const rooms = results.map(item => item.room)
        if (rooms.length > 0) {
            const placeholders = rooms.map(() => '?').join(',')
            // 批量查询置顶状态
            sql = `SELECT room FROM pinned_chat WHERE user_id=? AND room IN (${placeholders})`
            let pinnedResp = await Query(sql, [id, ...rooms])
            if (!pinnedResp.err && pinnedResp.results) {
                pinnedResp.results.forEach(row => {
                    pinnedRooms.add(row.room)
                })
            }
            // 批量查询免打扰状态
            sql = `SELECT room FROM muted_chat WHERE user_id=? AND room IN (${placeholders})`
            let mutedResp = await Query(sql, [id, ...rooms])
            if (!mutedResp.err && mutedResp.results) {
                mutedResp.results.forEach(row => {
                    mutedRooms.add(row.room)
                })
            }
        }
    }
    
    // 批量查询所有好友的用户信息（优化性能）
    const userInfoMap = new Map()
    if (results && results.length > 0) {
        const userIds = [...new Set(results.map(item => item.user_id))]
        if (userIds.length > 0) {
            const placeholders = userIds.map(() => '?').join(',')
            sql = `SELECT id, avatar, name, email, username FROM user WHERE id IN (${placeholders})`
            let userInfoResp = await Query(sql, userIds)
            if (!userInfoResp.err && userInfoResp.results) {
                userInfoResp.results.forEach(user => {
                    userInfoMap.set(user.id, user)
                })
            }
        }
    }
    
    // 批量查询所有房间的未读消息数（优化性能）
    const unreadCountMap = new Map()
    if (results && results.length > 0) {
        const rooms = results.map(item => item.room)
        if (rooms.length > 0) {
            const placeholders = rooms.map(() => '?').join(',')
            sql = `SELECT room, COUNT(*) as unreadCount FROM message WHERE room IN (${placeholders}) AND receiver_id=? AND status=0 GROUP BY room`
            let unreadResp = await Query(sql, [...rooms, id])
            if (!unreadResp.err && unreadResp.results) {
                unreadResp.results.forEach(row => {
                    unreadCountMap.set(row.room, row.unreadCount)
                })
            }
        }
    }
    
    // 批量查询所有房间的最后一条消息（优化性能）
    const lastMessageMap = new Map()
    if (results && results.length > 0) {
        const rooms = results.map(item => item.room)
        if (rooms.length > 0) {
            // 使用窗口函数获取每个房间的最后一条消息
            const placeholders = rooms.map(() => '?').join(',')
            sql = `SELECT m.room, m.content as lastMessage, m.media_type, m.is_recalled, m.sender_id, m.receiver_id, m.requires_verification
                   FROM (
                       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.room ORDER BY m.created_at DESC) as rn
                       FROM message m
                       LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                       WHERE m.room IN (${placeholders}) 
                       AND dm.id IS NULL 
                       AND m.requires_verification = 0
                       AND m.is_blocked = 0
                       AND (m.media_type != 'system' OR m.sender_id = ?)
                   ) m
                   WHERE m.rn = 1`
            let lastMsgResp = await Query(sql, [id, ...rooms, id])
            if (!lastMsgResp.err && lastMsgResp.results) {
                lastMsgResp.results.forEach(msg => {
                    lastMessageMap.set(msg.room, msg)
                })
            }
        }
    }
    
    // 处理每个好友的数据
    for (const index in results) {
        let item = results[index]
        
        // 使用批量查询的未读消息数
        results[index].unreadCount = unreadCountMap.get(item.room) || 0
        
        // 使用批量查询的最后一条消息
        const lastMsg = lastMessageMap.get(item.room)
        if (lastMsg) {
            if (lastMsg.is_recalled) {
                // 如果消息已撤回，显示撤回提示
                // 判断是自己撤回的还是对方撤回的
                if (lastMsg.sender_id === id) {
                    results[index].lastMessage = '你撤回了一条消息'
                } else {
                    // 使用批量查询的用户信息
                    const userInfo = userInfoMap.get(item.user_id)
                    let displayName = '对方'
                    if (userInfo) {
                        const currentUsername = userInfo.username || item.receiver_username || null
                        // 优先使用备注，如果没有备注则使用昵称，最后使用用户名
                        const remark = item.remark && item.remark.trim() && item.remark !== currentUsername ? item.remark : null
                        displayName = remark || userInfo.name || currentUsername || '对方'
                    } else {
                        // 如果没有查询到用户信息，使用备注或用户名
                        const remark = item.remark && item.remark.trim() && item.remark !== item.receiver_username ? item.remark : null
                        displayName = remark || item.receiver_username || '对方'
                    }
                    results[index].lastMessage = `${displayName}撤回了一条消息`
                }
                results[index].media_type = 'text'
            } else if (lastMsg.media_type === 'system') {
                // 如果是系统通知，直接使用系统通知的内容
                results[index].lastMessage = lastMsg.lastMessage
                results[index].media_type = 'system'
            } else if (lastMsg.media_type === 'forward_multiple') {
                // 如果是多选转发消息，解析JSON并显示友好的文本
                try {
                    const forwardData = typeof lastMsg.lastMessage === 'string' ? JSON.parse(lastMsg.lastMessage) : lastMsg.lastMessage
                    if (forwardData && forwardData.chat_title) {
                        if (forwardData.chat_type === 'private') {
                            results[index].lastMessage = `与${forwardData.chat_title}的聊天记录`
                        } else {
                            results[index].lastMessage = `群${forwardData.chat_title}的聊天记录`
                        }
                    } else {
                        results[index].lastMessage = '[聊天记录]'
                    }
                } catch (e) {
                    console.error('解析转发消息失败:', e)
                    results[index].lastMessage = '[聊天记录]'
                }
                results[index].media_type = 'forward_multiple'
            } else {
                results[index].lastMessage = lastMsg.lastMessage
                results[index].media_type = lastMsg.media_type
            }
        }
        
        // 使用批量查询的用户信息
        const userInfo = userInfoMap.get(item.user_id)
        if (userInfo) {
            results[index].avatar = userInfo.avatar
            // 保存原始昵称（用于搜索）
            results[index].nickname = userInfo.name || null
            // 保存邮箱（用于搜索）
            results[index].email = userInfo.email || null
            // 保存用户名（用于搜索）- 优先使用user表中的username，如果没有则使用receiver_username
            const currentUsername = userInfo.username || item.receiver_username || null
            results[index].username = currentUsername
            // 始终使用 user 表中的最新用户名更新 receiver_username（确保一致性）
            results[index].receiver_username = currentUsername
            // 优先使用备注，如果没有备注则使用昵称，最后使用用户名
            // remark 是当前用户对该好友的备注，如果备注为空字符串或等于用户名，则视为未设置备注
            const remark = item.remark && item.remark.trim() && item.remark !== currentUsername ? item.remark : null
            results[index].name = remark || userInfo.name || currentUsername
            // 保留 remark 字段（如果是空字符串或等于用户名，则设为null）
            results[index].remark = remark
        } else {
            // 如果没有查询到用户信息，使用备注或用户名
            results[index].nickname = null
            results[index].email = null
            results[index].username = item.receiver_username || null
            const remark = item.remark && item.remark.trim() && item.remark !== item.receiver_username ? item.remark : null
            results[index].name = remark || item.receiver_username
            results[index].remark = remark
        }
        // 私聊类型
        results[index].chat_type = 'private'
        
        // 使用批量查询的结果设置置顶状态和免打扰状态
        results[index].is_pinned = pinnedRooms.has(item.room) ? 1 : 0
        results[index].is_muted = mutedRooms.has(item.room) ? 1 : 0
    }
    // 处理 一开始查询结果可能为空 results的值undefined导致报错
    if (results) {
        data.push(...results)
    }
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    //获取所有群聊聊天列表 获取头像,姓名,房间号和最后一次更新时间
    sql = 'SELECT gc.id as group_id,avatar,name,gc.room,msg_sta.updated_at,gc.is_disbanded FROM group_chat as gc,(SELECT * FROM group_members WHERE user_id=?) as gm,message_statistics as msg_sta WHERE gc.id=gm.group_id and gc.room=msg_sta.room ORDER BY msg_sta.updated_at DESC;'
    let resObj = await Query(sql, [id])
    // 查询数据失败
    if (resObj.err) return RespError(res, RespServerErr)
    let results2 = resObj.results
    
    // 批量查询所有群聊的置顶状态、免打扰状态和备注（优化性能）
    const groupPinnedRooms = new Set()
    const groupMutedRooms = new Set()
    const groupRemarkMap = new Map()
    if (results2 && results2.length > 0) {
        const groupRooms = results2.map(item => item.room)
        const groupIds = results2.map(item => item.group_id)
        if (groupRooms.length > 0) {
            const placeholders = groupRooms.map(() => '?').join(',')
            // 批量查询置顶状态
            sql = `SELECT room FROM pinned_chat WHERE user_id=? AND room IN (${placeholders})`
            let pinnedResp = await Query(sql, [id, ...groupRooms])
            if (!pinnedResp.err && pinnedResp.results) {
                pinnedResp.results.forEach(row => {
                    groupPinnedRooms.add(row.room)
                })
            }
            // 批量查询免打扰状态
            sql = `SELECT room FROM muted_chat WHERE user_id=? AND room IN (${placeholders})`
            let mutedResp = await Query(sql, [id, ...groupRooms])
            if (!mutedResp.err && mutedResp.results) {
                mutedResp.results.forEach(row => {
                    groupMutedRooms.add(row.room)
                })
            }
            // 批量查询群聊备注
            const groupPlaceholders = groupIds.map(() => '?').join(',')
            sql = `SELECT group_id, remark FROM group_remark WHERE user_id=? AND group_id IN (${groupPlaceholders})`
            let remarkResp = await Query(sql, [id, ...groupIds])
            if (!remarkResp.err && remarkResp.results) {
                remarkResp.results.forEach(row => {
                    if (row.remark) {
                        groupRemarkMap.set(row.group_id, row.remark)
                    }
                })
            }
        }
        // 批量查询所有群聊的成员数量
        if (groupIds.length > 0) {
            const groupPlaceholders = groupIds.map(() => '?').join(',')
            sql = `SELECT group_id, COUNT(*) as member_count FROM group_members WHERE group_id IN (${groupPlaceholders}) GROUP BY group_id`
            let memberCountResp = await Query(sql, groupIds)
            if (!memberCountResp.err && memberCountResp.results) {
                const memberCountMap = new Map()
                memberCountResp.results.forEach(row => {
                    memberCountMap.set(row.group_id, row.member_count)
                })
                results2.forEach((item, idx) => {
                    const count = memberCountMap.get(item.group_id) || 0
                    results2[idx].member_count = count
                    results2[idx].members_len = count // 兼容旧字段名
                })
            }
        }
    }
    
    // 批量查询所有群聊的未读消息数（优化性能）
    const groupUnreadCountMap = new Map()
    if (results2 && results2.length > 0) {
        const groupRooms = results2.map(item => item.room)
        const groupIds = results2.map(item => item.group_id)
        if (groupRooms.length > 0 && groupIds.length > 0) {
            // 构建批量查询：为每个群聊查询未读消息数
            // 使用room和receiver_id的组合来匹配
            const roomGroupPairs = results2.map(item => ({ room: item.room, group_id: item.group_id }))
            const placeholders = roomGroupPairs.map(() => '(m.room = ? AND m.receiver_id = ?)').join(' OR ')
            const params = []
            roomGroupPairs.forEach(pair => {
                params.push(pair.room, pair.group_id)
            })
            sql = `SELECT m.room, COUNT(*) as unreadCount 
                   FROM message m 
                   LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                   LEFT JOIN message_read mr ON m.id = mr.message_id AND mr.user_id = ?
                   WHERE m.type = 'group' 
                   AND m.sender_id != ? 
                   AND dm.id IS NULL 
                   AND mr.id IS NULL
                   AND (${placeholders})
                   GROUP BY m.room`
            let unreadResp = await Query(sql, [id, id, id, ...params])
            if (!unreadResp.err && unreadResp.results) {
                unreadResp.results.forEach(row => {
                    groupUnreadCountMap.set(row.room, row.unreadCount)
                })
            }
        }
    }
    
    // 批量查询所有群聊的最后一条消息（优化性能）
    const groupLastMessageMap = new Map()
    const roomToGroupIdMap = new Map() // 用于存储room到group_id的映射
    if (results2 && results2.length > 0) {
        const groupRooms = results2.map(item => item.room)
        const groupIds = results2.map(item => item.group_id)
        // 建立room到group_id的映射
        results2.forEach(item => {
            roomToGroupIdMap.set(item.room, item.group_id)
        })
        if (groupRooms.length > 0) {
            // 使用窗口函数批量查询每个房间的最后一条消息
            const placeholders = groupRooms.map(() => '?').join(',')
            sql = `SELECT m.room, m.id as message_id, m.content as lastMessage, m.media_type, m.is_recalled, m.sender_id, m.mention_all,
                          u.name, u.username, gm.nickname, m.receiver_id as group_id
                   FROM (
                       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.room ORDER BY m.created_at DESC) as rn
                       FROM message m
                       LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                       WHERE m.room IN (${placeholders}) 
                       AND dm.id IS NULL
                   ) m
                   LEFT JOIN user u ON u.id = m.sender_id
                   LEFT JOIN group_members gm ON gm.group_id = m.receiver_id AND gm.user_id = m.sender_id
                   WHERE m.rn = 1`
            let lastMsgResp = await Query(sql, [id, ...groupRooms])
            if (!lastMsgResp.err && lastMsgResp.results) {
                lastMsgResp.results.forEach(msg => {
                    // 确保group_id正确（使用receiver_id，因为群聊消息的receiver_id就是group_id）
                    groupLastMessageMap.set(msg.room, msg)
                })
            }
        }
    }
    
    //获取最后一条信息
    for (const index in results2) {
        let item = results2[index]
        
        // 使用批量查询的未读消息数
        results2[index].unreadCount = groupUnreadCountMap.get(item.room) || 0
        
        // 成员数量已在上面批量查询中设置，这里不需要再查询
        
        // 使用批量查询的结果设置免打扰状态
        const isMuted = groupMutedRooms.has(item.room) ? 1 : 0
        results2[index].is_muted = isMuted
        
        // 使用批量查询的最后一条消息
        const lastMsg = groupLastMessageMap.get(item.room)
        let r
        if (lastMsg) {
            // 确保group_id正确
            lastMsg.group_id = item.group_id
            r = { results: [lastMsg] }
        } else {
            r = { results: [] }
        }
        if (r.results && r.results[0]) {
            const lastMsg = r.results[0]
            
            // 查询@信息（检查当前用户是否被@）
            let isMentioned = false
            let isMentionAll = false
            let mentionRead = false
            if (lastMsg.message_id) {
                // 检查是否@所有人
                if (lastMsg.mention_all === 1) {
                    isMentionAll = true
                    // 检查是否已读
                    sql = `SELECT id FROM message_mention_read WHERE message_id=? AND user_id=?`
                    const mentionReadResp = await Query(sql, [lastMsg.message_id, id])
                    mentionRead = mentionReadResp.results && mentionReadResp.results.length > 0
                    if (!mentionRead) {
                        isMentioned = true
                    }
                } else {
                    // 检查是否@当前用户
                    sql = `SELECT id FROM message_mention WHERE message_id=? AND user_id=?`
                    const mentionResp = await Query(sql, [lastMsg.message_id, id])
                    if (mentionResp.results && mentionResp.results.length > 0) {
                        // 检查是否已读
                        sql = `SELECT id FROM message_mention_read WHERE message_id=? AND user_id=?`
                        const mentionReadResp = await Query(sql, [lastMsg.message_id, id])
                        mentionRead = mentionReadResp.results && mentionReadResp.results.length > 0
                        if (!mentionRead) {
                            isMentioned = true
                        }
                    }
                }
            }
            
            // 如果是系统通知，需要判断是否是自己发送的，并修改显示文本
            if (lastMsg.media_type === 'system') {
                // 检查是否是邀请加入群聊的系统通知（JSON格式）
                let systemDisplayContent = lastMsg.lastMessage
                try {
                    const contentData = JSON.parse(lastMsg.lastMessage)
                    if (contentData.type === 'invite' && contentData.creator_id && contentData.invited_member_ids) {
                        // 获取创建者的显示名称（对于当前用户）
                        let creatorDisplayName = '用户'
                        if (contentData.creator_id === id) {
                            // 如果是自己，显示"你"
                            creatorDisplayName = '你'
                        } else {
                            // 查询当前用户对创建者的好友备注
                            sql = `SELECT f.remark, u.name, u.username
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   LEFT JOIN user u ON u.id = f.user_id
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const creatorRemarkResp = await Query(sql, [contentData.creator_id, id])
                            if (creatorRemarkResp.results && creatorRemarkResp.results.length > 0) {
                                const remark = creatorRemarkResp.results[0].remark
                                const name = creatorRemarkResp.results[0].name
                                const username = creatorRemarkResp.results[0].username
                                // 优先级：好友备注 > 个人昵称 > 用户名
                                if (remark && remark.trim() && remark !== username) {
                                    creatorDisplayName = remark.trim()
                                } else {
                                    creatorDisplayName = name || username || '用户'
                                }
                            } else {
                                // 如果没有好友关系，使用创建者的基本信息
                                sql = `SELECT name, username FROM user WHERE id=?`
                                const creatorResp = await Query(sql, [contentData.creator_id])
                                if (creatorResp.results && creatorResp.results.length > 0) {
                                    creatorDisplayName = creatorResp.results[0].name || creatorResp.results[0].username || '用户'
                                }
                            }
                        }
                        
                        // 获取被邀请成员的显示名称列表（对于当前用户）
                        const invitedMemberNames = []
                        for (const memberId of contentData.invited_member_ids) {
                            let memberDisplayName = '用户'
                            if (memberId === id) {
                                // 如果是自己，显示"你"
                                memberDisplayName = '你'
                            } else {
                                // 查询当前用户对该成员的好友备注
                                sql = `SELECT f.remark, u.name, u.username
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       LEFT JOIN user u ON u.id = f.user_id
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const memberRemarkResp = await Query(sql, [memberId, id])
                                if (memberRemarkResp.results && memberRemarkResp.results.length > 0) {
                                    const remark = memberRemarkResp.results[0].remark
                                    const name = memberRemarkResp.results[0].name
                                    const username = memberRemarkResp.results[0].username
                                    // 优先级：好友备注 > 个人昵称 > 用户名
                                    if (remark && remark.trim() && remark !== username) {
                                        memberDisplayName = remark.trim()
                                    } else {
                                        memberDisplayName = name || username || '用户'
                                    }
                                } else {
                                    // 如果没有好友关系，使用成员的基本信息
                                    sql = `SELECT name, username FROM user WHERE id=?`
                                    const memberResp = await Query(sql, [memberId])
                                    if (memberResp.results && memberResp.results.length > 0) {
                                        memberDisplayName = memberResp.results[0].name || memberResp.results[0].username || '用户'
                                    }
                                }
                            }
                            invitedMemberNames.push(memberDisplayName)
                        }
                        
                        // 生成系统通知内容（包含时间戳）
                        // 从消息统计表获取更新时间作为时间戳
                        let timeStr = ''
                        if (item.updated_at) {
                          try {
                            timeStr = new Date(item.updated_at).toLocaleString('zh-CN', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit',
                              hour12: false 
                            }).replace(/\//g, '/')
                          } catch (e) {
                            // 如果时间解析失败，使用当前时间
                            timeStr = new Date().toLocaleString('zh-CN', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit',
                              hour12: false 
                            }).replace(/\//g, '/')
                          }
                        }
                        systemDisplayContent = `${creatorDisplayName}邀请${invitedMemberNames.join('、')}加入群聊`
                    } else if (contentData.type === 'invite_member' && contentData.inviter_id && contentData.invited_user_id) {
                        // 处理添加群成员的系统通知
                        // 获取邀请者的显示名称（对于当前用户）
                        let inviterDisplayName = '用户'
                        if (contentData.inviter_id === id) {
                            // 如果邀请者是自己，显示"你"
                            inviterDisplayName = '你'
                        } else {
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const inviterResp = await Query(sql, [item.group_id, contentData.inviter_id])
                            if (inviterResp.results && inviterResp.results.length > 0) {
                                const inviterInfo = inviterResp.results[0]
                                // 查询当前用户对邀请者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.inviter_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== inviterInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = inviterInfo.group_nickname
                                if (groupNickname && groupNickname === inviterInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                inviterDisplayName = groupNickname || friendRemark || inviterInfo.name || inviterInfo.username || '用户'
                            }
                        }
                        
                        // 获取被邀请者的显示名称（对于当前用户）
                        let invitedDisplayName = '用户'
                        if (contentData.invited_user_id === id) {
                            // 如果被邀请者是自己，显示"你"
                            invitedDisplayName = '你'
                        } else {
                            let groupNickname = null
                            let friendRemark = null
                            let userName = null
                            let userUsername = null
                            
                            // 查询群成员信息（包含群聊昵称）- 可能查询不到（如果刚被邀请还没加入）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const invitedResp = await Query(sql, [item.group_id, contentData.invited_user_id])
                            if (invitedResp.results && invitedResp.results.length > 0) {
                                const invitedInfo = invitedResp.results[0]
                                groupNickname = invitedInfo.group_nickname
                                userName = invitedInfo.name
                                userUsername = invitedInfo.username
                                // 如果群聊昵称等于个人昵称（默认值），忽略群聊昵称
                                if (groupNickname && groupNickname === userName) {
                                    groupNickname = null
                                }
                            } else {
                                // 如果查询不到群成员信息，查询用户基本信息
                                sql = `SELECT name, username FROM user WHERE id=?`
                                const userResp = await Query(sql, [contentData.invited_user_id])
                                if (userResp.results && userResp.results.length > 0) {
                                    userName = userResp.results[0].name
                                    userUsername = userResp.results[0].username
                                }
                            }
                            
                            // 查询当前用户对被邀请者的好友备注（无论是否已加入群聊）
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.invited_user_id, id])
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== userUsername) {
                                    friendRemark = remark
                                }
                            }
                            
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            invitedDisplayName = groupNickname || friendRemark || userName || userUsername || '用户'
                        }
                        
                        // 生成系统通知内容（包含时间戳）
                        const timeStr = new Date(lastMsg.created_at || new Date()).toLocaleString('zh-CN', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit',
                          hour12: false 
                        }).replace(/\//g, '/')
                        systemDisplayContent = `${inviterDisplayName}邀请了${invitedDisplayName}进入群聊`
                    } else if (contentData.type === 'leave_group' && contentData.user_id) {
                        // 处理退出群聊的系统通知
                        if (contentData.user_id === id) {
                            // 如果退出者是自己，显示"你退出了群聊"
                            systemDisplayContent = '你退出了群聊'
                        } else {
                            // 获取退出者的显示名称（对于当前用户）
                            // 系统通知中包含了退出者的群聊昵称、个人昵称和用户名
                            let leaverDisplayName = '用户'
                            // 查询当前用户对退出者的好友备注
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.user_id, id])
                            let friendRemark = null
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== contentData.username) {
                                    friendRemark = remark
                                }
                            }
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            let groupNickname = contentData.group_nickname
                            if (groupNickname && groupNickname === contentData.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            leaverDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                            systemDisplayContent = `${leaverDisplayName}退出了群聊`
                        }
                    } else if (contentData.type === 'transfer_ownership' && contentData.old_creator_id && contentData.new_creator_id) {
                        // 处理转让群主的系统通知
                        if (contentData.new_creator_id === id) {
                            // 如果新群主是自己，显示"你已成为新的群主"
                            systemDisplayContent = '你已成为新的群主'
                        } else {
                            // 获取新群主的显示名称（对于当前用户）
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const newCreatorResp = await Query(sql, [item.group_id, contentData.new_creator_id])
                            let newCreatorDisplayName = '用户'
                            if (newCreatorResp.results && newCreatorResp.results.length > 0) {
                                const newCreatorInfo = newCreatorResp.results[0]
                                // 查询当前用户对新群主的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.new_creator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== newCreatorInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = newCreatorInfo.group_nickname
                                if (groupNickname && groupNickname === newCreatorInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                newCreatorDisplayName = groupNickname || friendRemark || newCreatorInfo.name || newCreatorInfo.username || '用户'
                            }
                            systemDisplayContent = `${newCreatorDisplayName}已成为新的群主`
                        }
                    } else if (contentData.type === 'disband_group' && contentData.creator_id) {
                        // 处理解散群聊的系统通知
                        if (contentData.creator_id === id) {
                            // 如果解散者是自己，显示"你已解散该群聊"
                            systemDisplayContent = '你已解散该群聊'
                        } else {
                            // 获取解散者的显示名称（对于当前用户）
                            // 查询当前用户对解散者的好友备注
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.creator_id, id])
                            let friendRemark = null
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== contentData.username) {
                                    friendRemark = remark
                                }
                            }
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            let groupNickname = contentData.group_nickname
                            if (groupNickname && groupNickname === contentData.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            const creatorDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                            systemDisplayContent = `${creatorDisplayName}已解散该群聊`
                        }
                    } else if (contentData.type === 'add_admin' && contentData.operator_id && contentData.admin_user_id) {
                        // 处理添加管理员的系统通知
                        if (contentData.admin_user_id === id) {
                            // 如果被添加的管理员是自己，显示"已将你添加为群管理员"
                            systemDisplayContent = '已将你添加为群管理员'
                        } else {
                            // 获取被添加管理员的显示名称（对于当前用户）
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const adminResp = await Query(sql, [item.group_id, contentData.admin_user_id])
                            let adminDisplayName = '用户'
                            if (adminResp.results && adminResp.results.length > 0) {
                                const adminInfo = adminResp.results[0]
                                // 查询当前用户对被添加管理员的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.admin_user_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== adminInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = adminInfo.group_nickname
                                if (groupNickname && groupNickname === adminInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                adminDisplayName = groupNickname || friendRemark || adminInfo.name || adminInfo.username || '用户'
                            }
                            systemDisplayContent = `已将${adminDisplayName}添加为群管理员`
                        }
                    } else if (contentData.type === 'remove_admin' && contentData.operator_id && contentData.admin_user_id) {
                        // 处理移除管理员的系统通知
                        if (contentData.admin_user_id === id) {
                            // 如果被移除的管理员是自己，显示"已将你从群管理员中移除"
                            systemDisplayContent = '已将你从群管理员中移除'
                        } else {
                            // 获取被移除管理员的显示名称（对于当前用户）
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const adminResp = await Query(sql, [item.group_id, contentData.admin_user_id])
                            let adminDisplayName = '用户'
                            if (adminResp.results && adminResp.results.length > 0) {
                                const adminInfo = adminResp.results[0]
                                // 查询当前用户对被移除管理员的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.admin_user_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== adminInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = adminInfo.group_nickname
                                if (groupNickname && groupNickname === adminInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                adminDisplayName = groupNickname || friendRemark || adminInfo.name || adminInfo.username || '用户'
                            }
                            systemDisplayContent = `已将${adminDisplayName}从群管理员中移除`
                        }
                    } else if (contentData.type === 'remove_member' && contentData.operator_id && contentData.removed_user_id) {
                        // 处理移除成员的系统通知
                        // 获取操作者的显示名称（对于当前用户）
                        let operatorDisplayName = '用户'
                        if (contentData.operator_id === id) {
                            // 如果操作者是自己，显示"你"
                            operatorDisplayName = '你'
                        } else {
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const operatorResp = await Query(sql, [item.group_id, contentData.operator_id])
                            if (operatorResp.results && operatorResp.results.length > 0) {
                                const operatorInfo = operatorResp.results[0]
                                // 查询当前用户对操作者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.operator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== operatorInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = operatorInfo.group_nickname
                                if (groupNickname && groupNickname === operatorInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                operatorDisplayName = groupNickname || friendRemark || operatorInfo.name || operatorInfo.username || '用户'
                            } else {
                                // 如果查询不到群成员信息，使用系统通知中的信息
                                // 查询当前用户对操作者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.operator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== contentData.operator_username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = contentData.operator_group_nickname
                                if (groupNickname && groupNickname === contentData.operator_name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
                            }
                        }
                        
                        // 获取被移除成员的显示名称（对于当前用户）
                        let removedDisplayName = '用户'
                        if (contentData.removed_user_id === id) {
                            // 如果被移除的成员是自己，显示"你"
                            removedDisplayName = '你'
                        } else {
                            // 查询群成员信息（包含群聊昵称）- 可能查询不到（如果已经被移除了）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const removedResp = await Query(sql, [item.group_id, contentData.removed_user_id])
                            if (removedResp.results && removedResp.results.length > 0) {
                                const removedInfo = removedResp.results[0]
                                // 查询当前用户对被移除成员的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.removed_user_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== removedInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = removedInfo.group_nickname
                                if (groupNickname && groupNickname === removedInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                removedDisplayName = groupNickname || friendRemark || removedInfo.name || removedInfo.username || '用户'
                            } else {
                                // 如果查询不到群成员信息（已经被移除了），使用系统通知中的信息
                                // 查询当前用户对被移除成员的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.removed_user_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== contentData.removed_username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = contentData.removed_group_nickname
                                if (groupNickname && groupNickname === contentData.removed_name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                removedDisplayName = groupNickname || friendRemark || contentData.removed_name || contentData.removed_username || '用户'
                            }
                        }
                        
                        systemDisplayContent = `${operatorDisplayName}将${removedDisplayName}移出了群聊`
                    } else if (contentData.type === 'recall_member_message' && contentData.operator_id) {
                        // 处理撤回成员消息的系统通知
                        // 获取操作者的显示名称（对于当前用户）
                        let operatorDisplayName = '用户'
                        if (contentData.operator_id === id) {
                            // 如果操作者是自己，显示"你"
                            operatorDisplayName = '你'
                        } else {
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = ? AND gm.user_id = ?
                                   LIMIT 1`
                            const operatorResp = await Query(sql, [item.group_id, contentData.operator_id])
                            if (operatorResp.results && operatorResp.results.length > 0) {
                                const operatorInfo = operatorResp.results[0]
                                // 查询当前用户对操作者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.operator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== operatorInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = operatorInfo.group_nickname
                                if (groupNickname && groupNickname === operatorInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                operatorDisplayName = groupNickname || friendRemark || operatorInfo.name || operatorInfo.username || '用户'
                            } else {
                                // 如果查询不到群成员信息，使用系统通知中的信息
                                // 查询当前用户对操作者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.operator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== contentData.operator_username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = contentData.operator_group_nickname
                                if (groupNickname && groupNickname === contentData.operator_name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
                            }
                        }
                        
                        systemDisplayContent = `${operatorDisplayName}撤回了一条成员消息`
                    }
                } catch (e) {
                    // 如果不是JSON格式，使用原始内容
                    systemDisplayContent = lastMsg.lastMessage
                }
                
                // 判断系统通知是否包含"修改了群聊名称为"
                if (systemDisplayContent && systemDisplayContent.includes('修改了群聊名称为')) {
                    // 查询发送者信息，判断是否是自己发送的
                    if (lastMsg.sender_id === id) {
                        // 提取新群聊名称
                        const match = systemDisplayContent.match(/修改了群聊名称为\s*(.+)/)
                        let systemMsg = ''
                        if (match && match[1]) {
                            systemMsg = `你修改了群聊名称为${match[1]}`
                        } else {
                            systemMsg = systemDisplayContent
                        }
                        // 如果开启了免打扰且有未读消息，在消息前显示未读数
                        if (isMuted === 1 && results2[index].unreadCount > 0) {
                            results2[index].lastMessage = `【${results2[index].unreadCount}条】${systemMsg}`
                        } else {
                            results2[index].lastMessage = systemMsg
                        }
                    } else {
                        // 获取发送者显示名称（优先群内昵称，其次好友备注，然后个人昵称，最后用户名）
                        // 先查询当前用户对发送者的好友备注和群聊昵称
                        let friendRemark = null
                        let groupNickname = lastMsg.nickname
                        
                        // 查询当前用户对发送者的好友备注
                        sql = `SELECT f.remark 
                               FROM friend f 
                               INNER JOIN friend_group fg ON f.group_id = fg.id 
                               WHERE f.user_id = ? AND fg.user_id = ?
                               LIMIT 1`
                        const remarkResp = await Query(sql, [lastMsg.sender_id, id])
                        if (remarkResp.results && remarkResp.results.length > 0 && remarkResp.results[0].remark) {
                            const remark = remarkResp.results[0].remark.trim()
                            if (remark && remark !== lastMsg.username) {
                                friendRemark = remark
                            }
                        }
                        
                        // 如果群聊昵称等于个人昵称（默认值），忽略群聊昵称
                        if (groupNickname && groupNickname === lastMsg.name) {
                            groupNickname = null
                        }
                        
                        // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                        const senderName = groupNickname || friendRemark || lastMsg.name || lastMsg.username || '用户'
                        // 提取新群聊名称
                        const match = systemDisplayContent.match(/修改了群聊名称为\s*(.+)/)
                        let systemMsg = ''
                        if (match && match[1]) {
                            systemMsg = `${senderName}修改了群聊名称为${match[1]}`
                        } else {
                            systemMsg = systemDisplayContent
                        }
                        // 如果开启了免打扰且有未读消息，在消息前显示未读数
                        if (isMuted === 1 && results2[index].unreadCount > 0) {
                            results2[index].lastMessage = `【${results2[index].unreadCount}条】${systemMsg}`
                        } else {
                            results2[index].lastMessage = systemMsg
                        }
                    }
                } else {
                    // 其他系统通知直接显示（使用动态生成的内容）
                    // 如果开启了免打扰且有未读消息，在消息前显示未读数
                    if (isMuted === 1 && results2[index].unreadCount > 0) {
                        results2[index].lastMessage = `【${results2[index].unreadCount}条】${systemDisplayContent}`
                    } else {
                        results2[index].lastMessage = systemDisplayContent
                    }
                }
                results2[index].media_type = 'system'
            } else if (lastMsg.is_recalled) {
                // 如果消息已撤回，显示撤回提示
                // 判断是否是自己撤回的
                if (lastMsg.sender_id === id) {
                    const recallMsg = '你撤回了一条消息'
                    // 如果开启了免打扰且有未读消息，在消息前显示未读数
                    if (isMuted === 1 && results2[index].unreadCount > 0) {
                        results2[index].lastMessage = `【${results2[index].unreadCount}条】${recallMsg}`
                    } else {
                        results2[index].lastMessage = recallMsg
                    }
                } else {
                    // 获取发送者显示名称（优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名）
                    // 先查询当前用户对发送者的好友备注
                    sql = `SELECT f.remark 
                           FROM friend f 
                           INNER JOIN friend_group fg ON f.group_id = fg.id 
                           WHERE f.user_id = ? AND fg.user_id = ?
                           LIMIT 1`
                    const remarkResp = await Query(sql, [lastMsg.sender_id, id])
                    let friendRemark = null
                    if (remarkResp.results && remarkResp.results.length > 0 && remarkResp.results[0].remark) {
                        const remark = remarkResp.results[0].remark.trim()
                        if (remark && remark !== lastMsg.username) {
                            friendRemark = remark
                        }
                    }
                    // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名（与聊天区保持一致）
                    // 如果群聊昵称等于用户的name（默认值），则忽略群聊昵称，使用好友备注
                    let groupNickname = lastMsg.nickname
                    if (groupNickname && groupNickname === lastMsg.name) {
                        // 群聊昵称是默认值，忽略它
                        groupNickname = null
                    }
                    const senderName = groupNickname || friendRemark || lastMsg.name || lastMsg.username || '用户'
                    const recallMsg = `${senderName}撤回了一条消息`
                    // 如果开启了免打扰且有未读消息，在消息前显示未读数
                    if (isMuted === 1 && results2[index].unreadCount > 0) {
                        results2[index].lastMessage = `【${results2[index].unreadCount}条】${recallMsg}`
                    } else {
                        results2[index].lastMessage = recallMsg
                    }
                }
                results2[index].media_type = 'text'
            } else {
                // 保留完整的消息内容（包括@xxx或@所有人）
                let messageContent = lastMsg.lastMessage || ''
                
                // 如果是转发消息，解析JSON并显示友好的文本
                if (lastMsg.media_type === 'forward_multiple') {
                    try {
                        const forwardData = typeof messageContent === 'string' ? JSON.parse(messageContent) : messageContent
                        if (forwardData && forwardData.chat_title) {
                            if (forwardData.chat_type === 'private') {
                                messageContent = `与${forwardData.chat_title}的聊天记录`
                            } else {
                                messageContent = `群${forwardData.chat_title}的聊天记录`
                            }
                        } else {
                            messageContent = '[聊天记录]'
                        }
                    } catch (e) {
                        console.error('解析转发消息失败:', e)
                        messageContent = '[聊天记录]'
                    }
                }
                
                // 如果最后一条消息是自己发送的，直接显示内容，不显示发送者名称
                if (lastMsg.sender_id === id) {
                    // 如果开启了免打扰且有未读消息，在消息前显示未读数
                    if (isMuted === 1 && results2[index].unreadCount > 0) {
                        results2[index].lastMessage = `【${results2[index].unreadCount}条】${messageContent}`
                    } else {
                        results2[index].lastMessage = messageContent
                    }
                } else {
                    // 获取发送者显示名称（优先群内昵称，其次昵称，最后用户名）
                    // 查询当前用户对发送者的好友备注
                    sql = `SELECT f.remark 
                           FROM friend f 
                           INNER JOIN friend_group fg ON f.group_id = fg.id 
                           WHERE f.user_id = ? AND fg.user_id = ?
                           LIMIT 1`
                    const remarkResp = await Query(sql, [lastMsg.sender_id, id])
                    let friendRemark = null
                    if (remarkResp.results && remarkResp.results.length > 0 && remarkResp.results[0].remark) {
                        const remark = remarkResp.results[0].remark.trim()
                        if (remark && remark !== lastMsg.username) {
                            friendRemark = remark
                        }
                    }
                    // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                    let groupNickname = lastMsg.nickname
                    if (groupNickname && groupNickname === lastMsg.name) {
                        groupNickname = null
                    }
                    const senderName = groupNickname || friendRemark || lastMsg.name || lastMsg.username || '用户'
                    
                    // 构建显示消息（保留完整的消息内容，包括@xxx或@所有人）
                    let displayMessage = `${senderName}：${messageContent}`
                    
                    // 如果当前用户被@了且未读，添加@标记
                    if (isMentioned && !mentionRead && !isMuted) {
                        // 免打扰未开：显示【有人@我】或【@所有人】
                        const mentionTag = isMentionAll ? '【@所有人】' : '【有人@我】'
                        displayMessage = `${mentionTag}${displayMessage}`
                        results2[index].is_mentioned = true
                        results2[index].is_mention_all = isMentionAll
                        results2[index].mention_read = false
                        results2[index].last_message_id = lastMsg.message_id
                    } else if (isMentioned && !mentionRead && isMuted) {
                        // 免打扰开了：显示【有人@我】【n 条】或【@所有人】【n 条】
                        const mentionTag = isMentionAll ? '【@所有人】' : '【有人@我】'
                        if (results2[index].unreadCount > 0) {
                            displayMessage = `${mentionTag}【${results2[index].unreadCount}条】${displayMessage}`
                        } else {
                            displayMessage = `${mentionTag}${displayMessage}`
                        }
                        results2[index].is_mentioned = true
                        results2[index].is_mention_all = isMentionAll
                        results2[index].mention_read = false
                        results2[index].last_message_id = lastMsg.message_id
                    } else {
                        // 没有被@或已读，正常显示
                        // 如果开启了免打扰且有未读消息，在消息前显示未读数
                        if (isMuted === 1 && results2[index].unreadCount > 0) {
                            displayMessage = `【${results2[index].unreadCount}条】${displayMessage}`
                        }
                        results2[index].is_mentioned = false
                        results2[index].is_mention_all = false
                        results2[index].mention_read = true
                    }
                    
                    results2[index].lastMessage = displayMessage
                }
                results2[index].media_type = lastMsg.media_type
            }
        } else {
            // 如果没有找到最后一条消息（所有消息都被用户删除了），标记为需要过滤
            results2[index]._shouldFilter = true
        }
        // 群聊类型
        results2[index].chat_type = 'group'
        // 设置是否已解散（从查询结果中获取，如果没有则默认为0）
        results2[index].is_disbanded = item.is_disbanded || 0
        
        // 使用批量查询的结果设置置顶状态
        results2[index].is_pinned = groupPinnedRooms.has(item.room) ? 1 : 0
        
        // 免打扰状态已在上面查询过了，这里不需要重复查询
        
        // 使用批量查询的结果设置群聊备注
        const remark = groupRemarkMap.get(item.group_id)
        if (remark) {
            // 如果设置了备注，使用备注作为显示名称
            results2[index].remark = remark
            results2[index].name = remark
        } else {
            // 如果没有备注，检查群聊名称是否为空
            results2[index].remark = null
            if (!item.name || item.name.trim() === '') {
                // 如果群聊名称为空，计算默认名称（根据当前用户对每个成员的备注/昵称）
                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                sql = `SELECT gm.user_id, gm.nickname as group_nickname, u.name, u.username,
                              (SELECT f.remark 
                               FROM friend f 
                               INNER JOIN friend_group fg ON f.group_id = fg.id 
                               WHERE f.user_id = gm.user_id AND fg.user_id = ?
                               LIMIT 1) as friend_remark
                       FROM group_members gm 
                       LEFT JOIN user u ON gm.user_id = u.id 
                       WHERE gm.group_id=? 
                       ORDER BY gm.created_at ASC`
                const memberResp = await Query(sql, [id, item.group_id])
                if (!memberResp.err && memberResp.results.length > 0) {
                    const memberNames = memberResp.results.map(m => {
                        // 如果是当前用户自己，直接使用自己的名称，不查询备注
                        if (m.user_id === id) {
                            // 判断是否设置了群聊昵称（且不等于个人昵称，表示是用户主动设置的）
                            let groupNickname = m.group_nickname
                            if (groupNickname && groupNickname === m.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            // 对于自己，优先级：群聊昵称 > 个人昵称 > 用户名
                            return groupNickname || m.name || m.username || '用户'
                        } else {
                            // 对于其他成员，判断是否设置了群聊昵称（且不等于个人昵称，表示是用户主动设置的）
                            let groupNickname = m.group_nickname
                            if (groupNickname && groupNickname === m.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            const friendRemark = m.friend_remark && m.friend_remark.trim() && m.friend_remark !== m.username ? m.friend_remark : null
                            return groupNickname || friendRemark || m.name || m.username || '用户'
                        }
                    })
                    const defaultName = memberNames.join('、')
                    results2[index].name = defaultName
                } else {
                    results2[index].name = '群聊'
                }
            }
        }
    }
    // 过滤掉所有消息都被用户删除的群聊（已解散的群聊如果被用户删除，也不应该显示）
    if (results2.length > 0) {
        const filteredResults2 = results2.filter(item => !item._shouldFilter)
        data.push(...filteredResults2)
    }
    data.sort((a, b) => {
        let t1 = new Date(a.updated_at).getTime()
        let t2 = new Date(b.updated_at).getTime()

        if (t1 < t2) {
            return 1; // a 应该排在 b 前面
        } else if (t1 > t2) {
            return -1; // a 应该排在 b 后面
        } else {
            return 0; // a 和 b 相等，位置不变
        }
    })
    return RespData(res, data)
}

/**
 * 建立聊天WebSocket连接
 * 需要获取信息:发送人ID,接收人ID,聊天内容,房间号,头像,内容的类型,文件大小,创建时间,(群聊中的昵称)
 * 1.获取房间号和对方id(群聊ID)
 * 2. 根据房间号获取所有聊天记录
 * 3.将当前用户的所有未读变成已读
 * 4.监听message
 * 5.消息类型目前分为text(文本),image(图片),video(视频),file(文件)
 */
async function ChatConnect(ws, req) {
    //获取参数
    let url = req.url.split("?")[1];
    let params = new URLSearchParams(url)
    let room = params.get("room")
    let id = params.get("id")
    let type = params.get("type")
    if (!rooms[room]) {
        rooms[room] = {}
    }
    rooms[room][id] = ws
    
    let sql
    let resp
    if (type == 'group') {
        // 排除当前用户已删除的消息，并查询用户信息和好友备注
        sql = `SELECT gm.nickname as group_nickname, m.*, u.avatar, u.name, u.username,
                      (SELECT f.remark 
                       FROM friend f 
                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                       WHERE f.user_id = m.sender_id AND fg.user_id = ?
                       LIMIT 1) as friend_remark
               FROM (
                   SELECT sender_id, receiver_id, content, room, media_type, file_size, message.created_at, message.id, message.is_recalled 
                   FROM message 
                   WHERE room = ? AND type = ?
               ) AS m 
               LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
               LEFT JOIN user as u ON u.id = m.sender_id 
               LEFT JOIN group_members as gm ON gm.group_id = (SELECT id FROM group_chat WHERE room=?) AND gm.user_id = m.sender_id 
               WHERE dm.id IS NULL
               ORDER BY m.created_at ASC`
        resp = await Query(sql, [id, room, type, id, room])
    } else {
        // 排除当前用户已删除的消息，并查询好友备注信息
        // 对于单向好友关系时发送的消息（requires_verification=1），只有发送者自己可以看到
        // 对于被拉黑时发送的消息（requires_verification=1 且发送者是被拉黑者），不显示在聊天记录中
        // 对于系统通知（media_type='system'），只显示 sender_id 等于当前用户 id 的系统通知（每个用户只看到自己的系统通知）
        sql = `SELECT m.*,u.avatar,u.name,u.username,f.remark 
               FROM (
                   SELECT sender_id, receiver_id, content, room, media_type, file_size, message.created_at, message.id, message.is_recalled, message.requires_verification, message.is_blocked
                   FROM message 
                   WHERE room = ? AND type = ?
               ) AS m 
               LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
               LEFT JOIN user as u ON u.id = m.sender_id 
               LEFT JOIN friend f ON f.user_id = m.sender_id AND f.room = m.room
               LEFT JOIN friend_group fg ON f.group_id = fg.id AND fg.user_id = ?
               WHERE dm.id IS NULL
               AND (
                   -- 如果消息标记为requires_verification=1，可能是单向好友关系或被拉黑
                   -- 对于单向好友关系：只有发送者自己可以看到这些消息，接收者（被删除方）不应该看到
                   -- 对于被拉黑：被拉黑者发送给拉黑者的消息，拉黑者不应该看到（不显示在聊天记录中）
                   -- 但被拉黑者可以看到自己发送的消息（显示红色圆圈和感叹号）
                   (m.requires_verification = 0 OR m.sender_id = ? OR NOT EXISTS (
                       SELECT 1 FROM blocked_friend bf 
                       WHERE bf.blocker_id = ? AND bf.blocked_id = m.sender_id
                   ))
                   AND
                   -- 过滤掉被拉黑时发送的消息（is_blocked=1），即使解除拉黑后也不显示
                   (m.is_blocked = 0 OR m.sender_id = ?)
                   AND
                   -- 对于系统通知，只显示当前用户自己的系统通知（sender_id = receiver_id = 当前用户id）
                   -- 或者显示"开启了朋友验证"的系统通知（即使sender_id不是当前用户，但内容包含"开启了朋友验证"）
                   (m.media_type != 'system' OR m.sender_id = ? OR m.content LIKE '%开启了朋友验证%')
               )
               ORDER BY m.created_at ASC`
        resp = await Query(sql, [room, type, id, id, id, id, id, id])
    }
    let results = resp.results || []
    let histroyMsg = []
    for (const item of results) {
        // 如果是系统通知，需要根据当前用户对成员的备注动态生成内容
        if (item.media_type === 'system') {
            let displayContent = item.content
            
            // 检查是否是邀请加入群聊的系统通知（JSON格式）
            try {
                const contentData = JSON.parse(item.content)
                if (contentData.type === 'invite' && contentData.creator_id && contentData.invited_member_ids) {
                    // 获取创建者的显示名称（对于当前用户）
                    let creatorDisplayName = '用户'
                    if (contentData.creator_id === parseInt(id)) {
                        // 如果是自己，显示"你"
                        creatorDisplayName = '你'
                    } else {
                        // 查询当前用户对创建者的好友备注
                        sql = `SELECT f.remark, u.name, u.username
                               FROM friend f 
                               INNER JOIN friend_group fg ON f.group_id = fg.id 
                               LEFT JOIN user u ON u.id = f.user_id
                               WHERE f.user_id = ? AND fg.user_id = ?
                               LIMIT 1`
                        const creatorRemarkResp = await Query(sql, [contentData.creator_id, id])
                        if (creatorRemarkResp.results && creatorRemarkResp.results.length > 0) {
                            const remark = creatorRemarkResp.results[0].remark
                            const name = creatorRemarkResp.results[0].name
                            const username = creatorRemarkResp.results[0].username
                            // 优先级：好友备注 > 个人昵称 > 用户名
                            if (remark && remark.trim() && remark !== username) {
                                creatorDisplayName = remark.trim()
                            } else {
                                creatorDisplayName = name || username || '用户'
                            }
                        } else {
                            // 如果没有好友关系，使用创建者的基本信息
                            sql = `SELECT name, username FROM user WHERE id=?`
                            const creatorResp = await Query(sql, [contentData.creator_id])
                            if (creatorResp.results && creatorResp.results.length > 0) {
                                creatorDisplayName = creatorResp.results[0].name || creatorResp.results[0].username || '用户'
                            }
                        }
                    }
                    
                    // 获取被邀请成员的显示名称列表（对于当前用户）
                    const invitedMemberNames = []
                    for (const memberId of contentData.invited_member_ids) {
                        let memberDisplayName = '用户'
                        if (memberId === parseInt(id)) {
                            // 如果是自己，显示"你"
                            memberDisplayName = '你'
                        } else {
                            // 查询当前用户对该成员的好友备注
                            sql = `SELECT f.remark, u.name, u.username
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   LEFT JOIN user u ON u.id = f.user_id
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const memberRemarkResp = await Query(sql, [memberId, id])
                            if (memberRemarkResp.results && memberRemarkResp.results.length > 0) {
                                const remark = memberRemarkResp.results[0].remark
                                const name = memberRemarkResp.results[0].name
                                const username = memberRemarkResp.results[0].username
                                // 优先级：好友备注 > 个人昵称 > 用户名
                                if (remark && remark.trim() && remark !== username) {
                                    memberDisplayName = remark.trim()
                                } else {
                                    memberDisplayName = name || username || '用户'
                                }
                            } else {
                                // 如果没有好友关系，使用成员的基本信息
                                sql = `SELECT name, username FROM user WHERE id=?`
                                const memberResp = await Query(sql, [memberId])
                                if (memberResp.results && memberResp.results.length > 0) {
                                    memberDisplayName = memberResp.results[0].name || memberResp.results[0].username || '用户'
                                }
                            }
                        }
                        invitedMemberNames.push(memberDisplayName)
                    }
                    
                        // 生成系统通知内容（包含时间戳）
                        const timeStr = new Date(item.created_at || new Date()).toLocaleString('zh-CN', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit',
                          hour12: false 
                        }).replace(/\//g, '/')
                        displayContent = `${creatorDisplayName}邀请${invitedMemberNames.join('、')}加入群聊`
                    } else if (contentData.type === 'invite_member' && contentData.inviter_id && contentData.invited_user_id) {
                        // 处理添加群成员的系统通知
                        // 获取邀请者的显示名称（对于当前用户）
                        let inviterDisplayName = '用户'
                        if (contentData.inviter_id === parseInt(id)) {
                            // 如果邀请者是自己，显示"你"
                            inviterDisplayName = '你'
                        } else {
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = (SELECT id FROM group_chat WHERE room=?) AND gm.user_id = ?
                                   LIMIT 1`
                            const inviterResp = await Query(sql, [room, contentData.inviter_id])
                            if (inviterResp.results && inviterResp.results.length > 0) {
                                const inviterInfo = inviterResp.results[0]
                                // 查询当前用户对邀请者的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.inviter_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== inviterInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = inviterInfo.group_nickname
                                if (groupNickname && groupNickname === inviterInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                inviterDisplayName = groupNickname || friendRemark || inviterInfo.name || inviterInfo.username || '用户'
                            }
                        }
                        
                        // 获取被邀请者的显示名称（对于当前用户）
                        let invitedDisplayName = '用户'
                        if (contentData.invited_user_id === parseInt(id)) {
                            // 如果被邀请者是自己，显示"你"
                            invitedDisplayName = '你'
                        } else {
                            let groupNickname = null
                            let friendRemark = null
                            let userName = null
                            let userUsername = null
                            
                            // 查询群成员信息（包含群聊昵称）- 可能查询不到（如果刚被邀请还没加入）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = (SELECT id FROM group_chat WHERE room=?) AND gm.user_id = ?
                                   LIMIT 1`
                            const invitedResp = await Query(sql, [room, contentData.invited_user_id])
                            if (invitedResp.results && invitedResp.results.length > 0) {
                                const invitedInfo = invitedResp.results[0]
                                groupNickname = invitedInfo.group_nickname
                                userName = invitedInfo.name
                                userUsername = invitedInfo.username
                                // 如果群聊昵称等于个人昵称（默认值），忽略群聊昵称
                                if (groupNickname && groupNickname === userName) {
                                    groupNickname = null
                                }
                            } else {
                                // 如果查询不到群成员信息，查询用户基本信息
                                sql = `SELECT name, username FROM user WHERE id=?`
                                const userResp = await Query(sql, [contentData.invited_user_id])
                                if (userResp.results && userResp.results.length > 0) {
                                    userName = userResp.results[0].name
                                    userUsername = userResp.results[0].username
                                }
                            }
                            
                            // 查询当前用户对被邀请者的好友备注（无论是否已加入群聊）
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.invited_user_id, id])
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== userUsername) {
                                    friendRemark = remark
                                }
                            }
                            
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            invitedDisplayName = groupNickname || friendRemark || userName || userUsername || '用户'
                        }
                        
                        // 生成系统通知内容（包含时间戳）
                        const timeStr = new Date(item.created_at || new Date()).toLocaleString('zh-CN', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit',
                          hour12: false 
                        }).replace(/\//g, '/')
                        displayContent = `${inviterDisplayName}邀请了${invitedDisplayName}进入群聊`
                    } else if (contentData.type === 'leave_group' && contentData.user_id) {
                        // 处理退出群聊的系统通知
                        if (contentData.user_id === parseInt(id)) {
                            // 如果退出者是自己，显示"你退出了群聊"
                            displayContent = '你退出了群聊'
                        } else {
                            // 获取退出者的显示名称（对于当前用户）
                            // 系统通知中包含了退出者的群聊昵称、个人昵称和用户名
                            let leaverDisplayName = '用户'
                            // 查询当前用户对退出者的好友备注
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.user_id, id])
                            let friendRemark = null
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== contentData.username) {
                                    friendRemark = remark
                                }
                            }
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            let groupNickname = contentData.group_nickname
                            if (groupNickname && groupNickname === contentData.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            leaverDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                            displayContent = `${leaverDisplayName}退出了群聊`
                        }
                    } else if (contentData.type === 'transfer_ownership' && contentData.old_creator_id && contentData.new_creator_id) {
                        // 处理转让群主的系统通知
                        if (contentData.new_creator_id === parseInt(id)) {
                            // 如果新群主是自己，显示"你已成为新的群主"
                            displayContent = '你已成为新的群主'
                        } else {
                            // 获取新群主的显示名称（对于当前用户）
                            // 查询群成员信息（包含群聊昵称）
                            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                                   FROM group_members gm
                                   LEFT JOIN user u ON u.id = gm.user_id
                                   WHERE gm.group_id = (SELECT id FROM group_chat WHERE room=?) AND gm.user_id = ?
                                   LIMIT 1`
                            const newCreatorResp = await Query(sql, [room, contentData.new_creator_id])
                            let newCreatorDisplayName = '用户'
                            if (newCreatorResp.results && newCreatorResp.results.length > 0) {
                                const newCreatorInfo = newCreatorResp.results[0]
                                // 查询当前用户对新群主的好友备注
                                sql = `SELECT f.remark 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE f.user_id = ? AND fg.user_id = ?
                                       LIMIT 1`
                                const friendRemarkResp = await Query(sql, [contentData.new_creator_id, id])
                                let friendRemark = null
                                if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                    const remark = friendRemarkResp.results[0].remark.trim()
                                    if (remark && remark !== newCreatorInfo.username) {
                                        friendRemark = remark
                                    }
                                }
                                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                                let groupNickname = newCreatorInfo.group_nickname
                                if (groupNickname && groupNickname === newCreatorInfo.name) {
                                    groupNickname = null // 群聊昵称是默认值，忽略它
                                }
                                newCreatorDisplayName = groupNickname || friendRemark || newCreatorInfo.name || newCreatorInfo.username || '用户'
                            }
                            displayContent = `${newCreatorDisplayName}已成为新的群主`
                        }
                    } else if (contentData.type === 'disband_group' && contentData.creator_id) {
                        // 处理解散群聊的系统通知
                        if (contentData.creator_id === parseInt(id)) {
                            // 如果解散者是自己，显示"你已解散该群聊"
                            displayContent = '你已解散该群聊'
                        } else {
                            // 获取解散者的显示名称（对于当前用户）
                            // 查询当前用户对解散者的好友备注
                            sql = `SELECT f.remark 
                                   FROM friend f 
                                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                                   WHERE f.user_id = ? AND fg.user_id = ?
                                   LIMIT 1`
                            const friendRemarkResp = await Query(sql, [contentData.creator_id, id])
                            let friendRemark = null
                            if (friendRemarkResp.results && friendRemarkResp.results.length > 0 && friendRemarkResp.results[0].remark) {
                                const remark = friendRemarkResp.results[0].remark.trim()
                                if (remark && remark !== contentData.username) {
                                    friendRemark = remark
                                }
                            }
                            // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                            let groupNickname = contentData.group_nickname
                            if (groupNickname && groupNickname === contentData.name) {
                                groupNickname = null // 群聊昵称是默认值，忽略它
                            }
                            const creatorDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                            displayContent = `${creatorDisplayName}已解散该群聊`
                        }
                    }
                } catch (e) {
                    // 如果不是JSON格式，使用原始内容
                    displayContent = item.content
                }
            
            histroyMsg.push({
                "id": item.id,
                "sender_id": item.sender_id,
                "receiver_id": item.receiver_id,
                "content": displayContent,
                "room": item.room,
                "type": 'system',
                "media_type": 'system',
                "created_at": new Date(item.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                "is_recalled": 0
            })
            continue
        }
        
        let content = item.content
        // 如果消息已撤回，显示撤回提示
        if (item.is_recalled) {
            if (item.sender_id == id) {
                content = '你撤回了一条消息'
            } else {
                // 获取发送者的显示名称
                let displayName = '用户'
                if (type === 'group') {
                    // 群聊：优先级 群聊昵称 > 好友备注 > 个人昵称 > 用户名
                    const friendRemark = item.friend_remark && item.friend_remark.trim() && item.friend_remark !== item.username ? item.friend_remark : null
                    // 如果群聊昵称等于用户的name（默认值），则忽略群聊昵称，使用好友备注
                    let groupNickname = item.group_nickname
                    if (groupNickname && groupNickname === item.name) {
                        // 群聊昵称是默认值，忽略它
                        groupNickname = null
                    }
                    displayName = groupNickname || friendRemark || item.name || item.username || '用户'
                } else {
                    // 私聊：优先级 好友备注 > 个人昵称 > 用户名
                    const remark = item.remark && item.remark.trim() && item.remark !== item.username ? item.remark : null
                    displayName = remark || item.name || item.username || '对方'
                }
                content = `${displayName}撤回了一条消息`
            }
        }
        const historyMsgItem = {
            "id": item.id,
            "sender_id": item.sender_id,
            "receiver_id": item.receiver_id,
            'nickname': type === 'group' ? (item.group_nickname || item.name) : (item.nickname || item.name),
            "name": item.name,
            "content": content,
            "room": item.room,
            "avatar": item.avatar,
            "type": item.media_type,
            "media_type": item.media_type,
            'file_size': formatBytes(item.file_size || 0),
            "created_at": new Date(item.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            "is_recalled": item.is_recalled || 0,
            "requires_verification": item.requires_verification || 0
        }
        
        // 如果是转发消息，解析content并添加forward_info
        if (item.media_type === 'forward_multiple') {
            try {
                const forwardData = typeof content === 'string' ? JSON.parse(content) : content
                if (forwardData && forwardData.chat_title) {
                    historyMsgItem.forward_info = forwardData
                }
            } catch (e) {
                console.error('解析转发消息内容失败:', e)
            }
        }
        
        histroyMsg.push(historyMsgItem)
    }
    ws.send(JSON.stringify(histroyMsg))
    //将所有未读消息变成已读（包括系统通知）
    if (type === 'group') {
        // 群聊：将该用户对所有消息的已读状态记录到message_read表
        // 查询该群聊的所有消息ID（排除当前用户已删除的消息，包括系统通知）
        sql = `SELECT m.id as message_id 
               FROM message m 
               LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
               WHERE m.room = ? AND m.type = 'group' AND dm.id IS NULL`
        const msgResp = await Query(sql, [id, room])
        if (msgResp.results && msgResp.results.length > 0) {
            // 批量插入已读记录（使用INSERT IGNORE避免重复）
            for (const msg of msgResp.results) {
                sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                await Query(sql, [msg.message_id, id])
            }
        }
    } else {
        // 私聊：使用status字段标记为已读
        sql = 'UPDATE message SET status=1 WHERE receiver_id=? AND room=? AND type=? AND status=0'
        await Query(sql, [id, room, type])
    }
    
    let fileInfo = null;
    let receivedSize = 0;
    let writeStream = null;
    
    ws.on('message', async (Resp_data) => {
        let message = JSON.parse(Resp_data)
        
        // 如果是群聊消息，检查群聊是否已解散
        if (type === 'group' && message.type !== 'system') {
            let sql = 'SELECT is_disbanded FROM group_chat WHERE room=?'
            let { err, results } = await Query(sql, [room])
            if (!err && results && results.length > 0 && results[0].is_disbanded === 1) {
                ws.send(JSON.stringify({ error: '无法在已解散的群聊中发送消息' }))
                return
            }
        }
        
        // 处理系统通知消息
        if (message.type === 'system') {
            // 系统通知消息需要保存到数据库，计入未读消息
            if (type === 'group') {
                // 获取群聊ID（群聊消息的receiver_id是群ID）
                sql = `SELECT id FROM group_chat WHERE room=?`
                const groupResp = await Query(sql, [room])
                if (groupResp.err || !groupResp.results || groupResp.results.length === 0) {
                    console.error('获取群聊ID失败')
                    return
                }
                const groupId = groupResp.results[0].id
                
                // 创建系统通知消息（receiver_id使用群ID，与普通群聊消息一致）
                const msg = {
                    sender_id: message.sender_id,
                    receiver_id: groupId, // 群聊消息的receiver_id是群ID
                    type: type,
                    media_type: 'system',
                    content: message.content,
                    room: room,
                    file_size: 0,
                    status: 0 // 默认未读，所有群成员都会看到未读
                }
                
                // 插入系统通知消息
                sql = 'INSERT INTO message SET ?'
                const insertResult = await Query(sql, msg)
                if (insertResult.err) {
                    console.error('插入系统通知失败:', insertResult.err)
                    return
                }
                
                const messageId = insertResult.results.insertId
                
                // 如果发送者在线，自动标记为已读（使用message_read表）
                if (rooms[room] && rooms[room][message.sender_id]) {
                    sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                    await Query(sql, [messageId, message.sender_id])
                }
                
                // 更新消息统计
                sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                await Query(sql, [room])
                
                // 构造系统通知消息对象用于广播
                const systemNotification = {
                    id: messageId,
                    type: 'system',
                    content: message.content,
                    room: room,
                    sender_id: message.sender_id,
                    created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                }
                
                // 广播给房间内所有在线用户
                if (rooms[room]) {
                    for (const key in rooms[room]) {
                        if (rooms[room][key] && rooms[room][key].readyState === 1) {
                            rooms[room][key].send(JSON.stringify(systemNotification))
                        }
                    }
                }
            } else {
                // 私聊不支持系统通知
                console.error('系统通知仅支持群聊')
            }
            return
        }
        
        let fileContent, fileSuffix, filename

        //判断其类型
        let msg = {
            sender_id: message.sender_id,
            receiver_id: message.receiver_id,
            type: type,
            media_type: message.media_type || message.type, // 优先使用media_type，如果没有则使用type
            room: room,
            file_size: 0,
        }
        switch (message.type) {
            case 'text':
                msg.content = message.content
                msg.mention_all = 0 // 默认值，稍后更新
                break
            case 'image':
                fileContent = Buffer.from(message.content, 'base64')
                fileSuffix = message.filename
                    .substring(message.filename.lastIndexOf(".") + 1)
                    .toLowerCase();
                filename = generateRandomString(32) + "." + fileSuffix
                notExitCreate(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/images`))
                fs.writeFileSync(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/images/${filename}`), fileContent)
                msg.content = `/uploads/message/${room.replace(/-/g, "_")}/images/${filename}`
                message.content = `/uploads/message/${room.replace(/-/g, "_")}/images/${filename}`
                break
            case 'video':
                fileContent = Buffer.from(message.content, 'base64')
                fileSuffix = message.filename
                    .substring(message.filename.lastIndexOf(".") + 1)
                    .toLowerCase();
                filename = generateRandomString(32) + "." + fileSuffix
                notExitCreate(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/video`))
                fs.writeFileSync(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/video/${filename}`), fileContent)
                msg.content = `/uploads/message/${room.replace(/-/g, "_")}/video/${filename}`
                message.content = `/uploads/message/${room.replace(/-/g, "_")}/video/${filename}`
                break
            case 'file':
                if (message.fileType == 'start') {
                    receivedSize = 0;
                    fileInfo = JSON.parse(message.fileInfo)
                    notExitCreate(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/file`))
                    writeStream = fs.createWriteStream(path.join(process.cwd(), `uploads/message/${room.replace(/-/g, "_")}/file/${message.filename}`));
                    return
                } else if (message.fileType == 'upload') {
                    fileContent = Buffer.from(message.content, 'base64')
                    // 接收文件块并写入文件
                    writeStream.write(fileContent);
                    receivedSize += fileContent.length;
                    // 如果接收完整个文件，则关闭文件流并发送上传成功消息
                    if (receivedSize === fileInfo.fileSize) {
                        writeStream.end(async () => {
                            msg.content = `/uploads/message/${room.replace(/-/g, "_")}/file/${message.filename}`
                            msg.file_size = receivedSize
                            message.content = `/uploads/message/${room.replace(/-/g, "_")}/file/${message.filename}`
                            if (rooms[room] && rooms[room][message.receiver_id]) {
                                msg.status = 1
                            } else {
                                msg.status = 0
                            }

                            // 检测单向好友关系（仅私聊）
                            let isUnidirectionalFriend = false
                            // 检测是否被拉黑（仅私聊）
                            let isBlocked = false
                            if (type === 'private') {
                                // 检查发送者是否有接收者的好友关系
                                sql = `SELECT f.id FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
                                const senderRelation = await Query(sql, [message.sender_id, message.receiver_id])
                                
                                // 检查接收者是否有发送者的好友关系
                                sql = `SELECT f.id FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
                                const receiverRelation = await Query(sql, [message.receiver_id, message.sender_id])
                                
                                // 如果发送者有接收者的好友关系，但接收者没有发送者的好友关系，则是单向好友关系
                                isUnidirectionalFriend = (senderRelation.results && senderRelation.results.length > 0) && 
                                                         (!receiverRelation.results || receiverRelation.results.length === 0)
                                
                                // 检查接收者是否被发送者拉黑（接收者拉黑了发送者）
                                sql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
                                const blockedCheck = await Query(sql, [message.receiver_id, message.sender_id])
                                isBlocked = blockedCheck.results && blockedCheck.results.length > 0
                            }
                            
                            // 保存requires_verification标记到数据库（单向好友关系或被拉黑都标记）
                            msg.requires_verification = (isUnidirectionalFriend || isBlocked) ? 1 : 0
                            msg.is_blocked = isBlocked ? 1 : 0 // 保存is_blocked标记到数据库

                            sql = 'INSERT INTO message SET ?'
                            const insertResult = await Query(sql, msg)
                            if (insertResult.err) {
                                console.error('插入文件消息失败:', insertResult.err)
                                ws.send(JSON.stringify({ error: '文件上传失败，请重试' }))
                                return
                            }
                            sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                            await Query(sql, [room])
                            
                            // 对于群聊，发送者自己的消息自动标记为已读
                            // 同时，将所有已打开群聊窗口的接收方的消息也标记为已读
                            if (type === 'group') {
                                sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                                await Query(sql, [insertResult.results.insertId, message.sender_id])
                                
                                // 检查所有已连接到该房间的用户（已打开群聊窗口的用户）
                                // 将这些用户的消息也标记为已读
                                if (rooms[room]) {
                                    for (const userId in rooms[room]) {
                                        // 跳过发送者自己（已经在上面标记了）
                                        if (parseInt(userId) !== message.sender_id) {
                                            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                                            await Query(sql, [insertResult.results.insertId, userId])
                                        }
                                    }
                                }
                            }
                            
                            // 获取发送者信息
                            let senderInfo = { avatar: null, name: null }
                            if (type === 'group') {
                                sql = `SELECT u.avatar, gm.nickname FROM user u LEFT JOIN group_members gm ON gm.user_id=u.id AND gm.group_id=(SELECT id FROM group_chat WHERE room=?) WHERE u.id=?`
                                const senderResp = await Query(sql, [room, message.sender_id])
                                if (senderResp.results && senderResp.results[0]) {
                                    senderInfo.avatar = senderResp.results[0].avatar
                                    senderInfo.nickname = senderResp.results[0].nickname
                                }
                            } else {
                                sql = `SELECT avatar, name FROM user WHERE id=?`
                                const senderResp = await Query(sql, [message.sender_id])
                                if (senderResp.results && senderResp.results[0]) {
                                    senderInfo.avatar = senderResp.results[0].avatar
                                    senderInfo.nickname = senderResp.results[0].name
                                }
                            }
                            
                            const fullMessage = {
                                ...message,
                                id: insertResult.results.insertId, // 添加消息ID，用于撤回和删除
                                avatar: senderInfo.avatar,
                                nickname: senderInfo.nickname,
                                file_size: formatBytes(receivedSize),
                                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                                requires_verification: (isUnidirectionalFriend || isBlocked) ? 1 : 0, // 标记是否需要验证或被拉黑
                                is_blocked: isBlocked ? 1 : 0 // 标记是否被拉黑
                            }
                            
                            // 先发送消息（确保消息在系统通知之前显示）
                            for (const key in rooms[room]) {
                                rooms[room][key].send(JSON.stringify(fullMessage))
                            }
                            
                            // 优先检查单向好友关系：如果是单向好友关系，发送"开启了朋友验证"系统通知
                            if (isUnidirectionalFriend) {
                                // 获取接收者的显示名称（备注/昵称/用户名）
                                sql = `SELECT f.remark, u.name, u.username 
                                       FROM friend f 
                                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                                       LEFT JOIN user u ON u.id = f.user_id
                                       WHERE f.user_id = ? AND fg.user_id = ? LIMIT 1`
                                const receiverInfoResp = await Query(sql, [message.receiver_id, message.sender_id])
                                
                                let receiverDisplayName = '用户'
                                if (receiverInfoResp.results && receiverInfoResp.results.length > 0) {
                                    const remark = receiverInfoResp.results[0].remark
                                    const name = receiverInfoResp.results[0].name
                                    const username = receiverInfoResp.results[0].username
                                    // 优先级：备注 > 昵称 > 用户名
                                    receiverDisplayName = (remark && remark.trim() && remark !== username) ? remark.trim() : (name || username || '用户')
                                } else {
                                    // 如果没有好友关系，查询用户基本信息
                                    sql = `SELECT name, username FROM user WHERE id=?`
                                    const userResp = await Query(sql, [message.receiver_id])
                                    if (userResp.results && userResp.results.length > 0) {
                                        receiverDisplayName = userResp.results[0].name || userResp.results[0].username || '用户'
                                    }
                                }
                                
                                // 创建系统通知消息并保存到数据库
                                const systemMsg = {
                                    sender_id: message.sender_id,
                                    receiver_id: message.sender_id, // 系统通知的接收者也是发送者自己
                                    type: type,
                                    media_type: 'system',
                                    content: `${receiverDisplayName} 开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求。对方验证通过后，才能聊天。发送朋友验证`,
                                    room: room,
                                    file_size: 0,
                                    status: 1, // 系统通知默认已读
                                    is_recalled: 0,
                                    requires_verification: 0
                                }
                                
                                sql = 'INSERT INTO message SET ?'
                                const systemInsertResult = await Query(sql, systemMsg)
                                if (!systemInsertResult.err) {
                                    const systemNotification = {
                                        id: systemInsertResult.results.insertId,
                                        type: 'system',
                                        content: systemMsg.content,
                                        room: room,
                                        sender_id: message.sender_id,
                                        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                                    }
                                    
                                    // 更新消息统计
                                    sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                                    await Query(sql, [room])
                                    
                                    // 只发送给发送者（在消息之后发送，确保顺序正确）
                                    if (rooms[room] && rooms[room][message.sender_id]) {
                                        // 使用 setTimeout 确保消息先显示，系统通知后显示
                                        setTimeout(() => {
                                            if (rooms[room] && rooms[room][message.sender_id]) {
                                                rooms[room][message.sender_id].send(JSON.stringify(systemNotification))
                                            }
                                        }, 100)
                                    }
                                }
                            } else if (isBlocked) {
                                // 如果不是单向好友关系但被拉黑，发送"被拒收"系统通知
                                // 创建系统通知消息并保存到数据库
                                const systemMsg = {
                                    sender_id: message.sender_id,
                                    receiver_id: message.sender_id, // 系统通知的接收者也是发送者自己
                                    type: type,
                                    media_type: 'system',
                                    content: '消息已发出，但被对方拒收了',
                                    room: room,
                                    file_size: 0,
                                    status: 1, // 系统通知默认已读
                                    is_recalled: 0,
                                    requires_verification: 0
                                }
                                
                                sql = 'INSERT INTO message SET ?'
                                const systemInsertResult = await Query(sql, systemMsg)
                                if (!systemInsertResult.err) {
                                    const systemNotification = {
                                        id: systemInsertResult.results.insertId,
                                        type: 'system',
                                        content: systemMsg.content,
                                        room: room,
                                        sender_id: message.sender_id,
                                        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                                    }
                                    
                                    // 更新消息统计
                                    sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                                    await Query(sql, [room])
                                    
                                    // 只发送给发送者（在消息之后发送，确保顺序正确）
                                    if (rooms[room] && rooms[room][message.sender_id]) {
                                        // 使用 setTimeout 确保消息先显示，系统通知后显示
                                        setTimeout(() => {
                                            if (rooms[room] && rooms[room][message.sender_id]) {
                                                rooms[room][message.sender_id].send(JSON.stringify(systemNotification))
                                            }
                                        }, 100)
                                    }
                                }
                            }
                            return
                        });
                    }
                    return
                }
                break
        }
        
        // 检测单向好友关系（仅私聊）
        let isUnidirectionalFriend = false
        // 检测是否被拉黑（仅私聊）
        let isBlocked = false
        if (type === 'private') {
            // 检查发送者是否有接收者的好友关系
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const senderRelation = await Query(sql, [message.sender_id, message.receiver_id])
            
            // 检查接收者是否有发送者的好友关系
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const receiverRelation = await Query(sql, [message.receiver_id, message.sender_id])
            
            // 如果发送者有接收者的好友关系，但接收者没有发送者的好友关系，则是单向好友关系
            isUnidirectionalFriend = (senderRelation.results && senderRelation.results.length > 0) && 
                                     (!receiverRelation.results || receiverRelation.results.length === 0)
            
            // 检查接收者是否被发送者拉黑（发送者拉黑了接收者）
            sql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
            const blockedCheck = await Query(sql, [message.receiver_id, message.sender_id])
            isBlocked = blockedCheck.results && blockedCheck.results.length > 0
        }
        
        if (rooms[room] && rooms[room][message.receiver_id]) {
            msg.status = 1
        } else {
            msg.status = 0
        }
        // 处理@信息（仅群聊文本消息）
        let mentionInfo = { mentionedUsers: [], mentionAll: false }
        if (type === 'group' && message.type === 'text' && message.content) {
            mentionInfo = await parseMentions(message.content, room, message.sender_id)
            msg.mention_all = mentionInfo.mentionAll ? 1 : 0
        }
        
        // 保存requires_verification标记到数据库（单向好友关系或被拉黑都标记）
        msg.requires_verification = (isUnidirectionalFriend || isBlocked) ? 1 : 0
        msg.is_blocked = isBlocked ? 1 : 0 // 保存is_blocked标记到数据库
        
        sql = 'INSERT INTO message SET ?'
        const insertResult = await Query(sql, msg)
        if (insertResult.err) {
            console.error('插入消息失败:', insertResult.err)
            ws.send(JSON.stringify({ error: '消息发送失败，请重试' }))
            return
        }
        
        const messageId = insertResult.results.insertId
        
        // 存储@的用户
        if (mentionInfo.mentionedUsers && mentionInfo.mentionedUsers.length > 0) {
            for (const userId of mentionInfo.mentionedUsers) {
                sql = `INSERT IGNORE INTO message_mention (message_id, user_id) VALUES (?, ?)`
                await Query(sql, [messageId, userId])
            }
        }
        
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 对于群聊，发送者自己的消息自动标记为已读
        // 同时，将所有已打开群聊窗口的接收方的消息也标记为已读
        if (type === 'group') {
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, message.sender_id])
            
            // 检查所有已连接到该房间的用户（已打开群聊窗口的用户）
            // 将这些用户的消息也标记为已读
            if (rooms[room]) {
                for (const userId in rooms[room]) {
                    // 跳过发送者自己（已经在上面标记了）
                    if (parseInt(userId) !== message.sender_id) {
                        sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                        await Query(sql, [messageId, userId])
                    }
                }
            }
        }
        
        // 获取发送者信息
        let senderInfo = { avatar: null, name: null }
        if (type === 'group') {
            sql = `SELECT u.avatar, gm.nickname FROM user u LEFT JOIN group_members gm ON gm.user_id=u.id AND gm.group_id=(SELECT id FROM group_chat WHERE room=?) WHERE u.id=?`
            const senderResp = await Query(sql, [room, message.sender_id])
            if (senderResp.results && senderResp.results[0]) {
                senderInfo.avatar = senderResp.results[0].avatar
                senderInfo.nickname = senderResp.results[0].nickname
            }
        } else {
            sql = `SELECT avatar, name FROM user WHERE id=?`
            const senderResp = await Query(sql, [message.sender_id])
            if (senderResp.results && senderResp.results[0]) {
                senderInfo.avatar = senderResp.results[0].avatar
                senderInfo.nickname = senderResp.results[0].name
            }
        }
        
        // 构造完整的消息对象
        const fullMessage = {
            ...message,
            id: insertResult.results.insertId, // 添加消息ID，用于撤回和删除
            avatar: senderInfo.avatar,
            nickname: senderInfo.nickname,
            file_size: msg.file_size > 0 ? formatBytes(msg.file_size) : undefined,
            created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            requires_verification: (isUnidirectionalFriend || isBlocked) ? 1 : 0, // 标记是否需要验证或被拉黑
            is_blocked: isBlocked ? 1 : 0 // 标记是否被拉黑
        }
        
        // 先发送消息（确保消息在系统通知之前显示）
        for (const key in rooms[room]) {
            rooms[room][key].send(JSON.stringify(fullMessage))
        }
        
        // 优先检查单向好友关系：如果是单向好友关系，发送"开启了朋友验证"系统通知
        if (isUnidirectionalFriend) {
            // 获取接收者的显示名称（备注/昵称/用户名）
            sql = `SELECT f.remark, u.name, u.username 
                   FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   LEFT JOIN user u ON u.id = f.user_id
                   WHERE f.user_id = ? AND fg.user_id = ? LIMIT 1`
            const receiverInfoResp = await Query(sql, [message.receiver_id, message.sender_id])
            
            let receiverDisplayName = '用户'
            if (receiverInfoResp.results && receiverInfoResp.results.length > 0) {
                const remark = receiverInfoResp.results[0].remark
                const name = receiverInfoResp.results[0].name
                const username = receiverInfoResp.results[0].username
                // 优先级：备注 > 昵称 > 用户名
                receiverDisplayName = (remark && remark.trim() && remark !== username) ? remark.trim() : (name || username || '用户')
            } else {
                // 如果没有好友关系，查询用户基本信息
                sql = `SELECT name, username FROM user WHERE id=?`
                const userResp = await Query(sql, [message.receiver_id])
                if (userResp.results && userResp.results.length > 0) {
                    receiverDisplayName = userResp.results[0].name || userResp.results[0].username || '用户'
                }
            }
            
            // 创建系统通知消息并保存到数据库
            const systemMsg = {
                sender_id: message.sender_id,
                receiver_id: message.sender_id, // 系统通知的接收者也是发送者自己
                type: type,
                media_type: 'system',
                content: `${receiverDisplayName} 开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求。对方验证通过后，才能聊天。发送朋友验证`,
                room: room,
                file_size: 0,
                status: 1, // 系统通知默认已读
                is_recalled: 0,
                requires_verification: 0
            }
            
            sql = 'INSERT INTO message SET ?'
            const systemInsertResult = await Query(sql, systemMsg)
            if (!systemInsertResult.err) {
                const systemNotification = {
                    id: systemInsertResult.results.insertId,
                    type: 'system',
                    content: systemMsg.content,
                    room: room,
                    sender_id: message.sender_id,
                    created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                }
                
                // 更新消息统计
                sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                await Query(sql, [room])
                
                // 只发送给发送者（在消息之后发送，确保顺序正确）
                if (rooms[room] && rooms[room][message.sender_id]) {
                    // 使用 setTimeout 确保消息先显示，系统通知后显示
                    setTimeout(() => {
                        if (rooms[room] && rooms[room][message.sender_id]) {
                            rooms[room][message.sender_id].send(JSON.stringify(systemNotification))
                        }
                    }, 100)
                }
            }
        } else if (isBlocked) {
            // 如果不是单向好友关系但被拉黑，发送"被拒收"系统通知
            // 创建系统通知消息并保存到数据库
            const systemMsg = {
                sender_id: message.sender_id,
                receiver_id: message.sender_id, // 系统通知的接收者也是发送者自己
                type: type,
                media_type: 'system',
                content: '消息已发出，但被对方拒收了',
                room: room,
                file_size: 0,
                status: 1, // 系统通知默认已读
                is_recalled: 0,
                requires_verification: 0
            }
            
            sql = 'INSERT INTO message SET ?'
            const systemInsertResult = await Query(sql, systemMsg)
            if (!systemInsertResult.err) {
                const systemNotification = {
                    id: systemInsertResult.results.insertId,
                    type: 'system',
                    content: systemMsg.content,
                    room: room,
                    sender_id: message.sender_id,
                    created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                }
                
                // 更新消息统计
                sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                await Query(sql, [room])
                
                // 只发送给发送者（在消息之后发送，确保顺序正确）
                if (rooms[room] && rooms[room][message.sender_id]) {
                    // 使用 setTimeout 确保消息先显示，系统通知后显示
                    setTimeout(() => {
                        if (rooms[room] && rooms[room][message.sender_id]) {
                            rooms[room][message.sender_id].send(JSON.stringify(systemNotification))
                        }
                    }, 100)
                }
            }
        }
    })
    
    ws.on('close', () => {
        if (rooms[room] && rooms[room][id]) {
            delete rooms[room][id]
            if (Object.keys(rooms[room]).length === 0) {
                delete rooms[room]
            }
        }
    })
}

/**
 * 撤回消息
 * 1. 用户可以撤回自己发送的消息（2分钟内）
 * 2. 群主可以撤回所有成员的消息（2分钟内）
 * 3. 管理员可以撤回普通成员的消息（2分钟内，不能撤回群主和管理员的消息）
 */
async function RecallMessage(req, res) {
    const { message_id } = req.body
    const userId = req.user.id
    
    if (!message_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 查询消息信息
        let sql = `SELECT id, sender_id, room, type, created_at FROM message WHERE id=?`
        let { err, results } = await Query(sql, [message_id])
        
        if (err || !results || results.length === 0) {
            return RespError(res, { code: 4004, message: '消息不存在' })
        }
        
        const message = results[0]
        const isOwnMessage = message.sender_id === userId
        
        // 如果不是自己发送的消息，检查是否有权限撤回他人消息
        if (!isOwnMessage) {
            // 检查是否是群聊
            sql = `SELECT id, creator_id FROM group_chat WHERE room=?`
            const groupCheck = await Query(sql, [message.room])
            const isGroupChat = groupCheck.results && groupCheck.results.length > 0
            
            if (!isGroupChat) {
                // 私聊只能撤回自己的消息
                return RespError(res, { code: 4003, message: '只能撤回自己发送的消息' })
            }
            
            const groupId = groupCheck.results[0].id
            const creatorId = groupCheck.results[0].creator_id
            
            // 检查操作者是否是群主
            const isOperatorOwner = userId === creatorId
            
            if (!isOperatorOwner) {
                // 如果不是群主，检查是否是管理员
                sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
                const adminCheck = await Query(sql, [groupId, userId])
                if (adminCheck.err) return RespError(res, RespServerErr)
                if (!adminCheck.results || adminCheck.results.length === 0) {
                    return RespError(res, { code: 4003, message: '只能撤回自己发送的消息' })
                }
                
                // 管理员不能撤回群主和其他管理员的消息
                // 检查被撤回消息的发送者是否是群主
                if (message.sender_id === creatorId) {
                    return RespError(res, { code: 4007, message: '管理员不能撤回群主的消息' })
                }
                
                // 检查被撤回消息的发送者是否是管理员
                sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
                const targetAdminCheck = await Query(sql, [groupId, message.sender_id])
                if (targetAdminCheck.err) return RespError(res, RespServerErr)
                if (targetAdminCheck.results && targetAdminCheck.results.length > 0) {
                    return RespError(res, { code: 4008, message: '管理员不能撤回其他管理员的消息' })
                }
            }
        }
        
        // 检查是否已经撤回
        if (message.is_recalled) {
            return RespError(res, { code: 4005, message: '消息已撤回' })
        }
        
        // 检查是否在2分钟内（120000毫秒）
        const messageTime = new Date(message.created_at).getTime()
        const now = Date.now()
        const timeDiff = now - messageTime
        
        if (timeDiff > 120000) {
            return RespError(res, { code: 4006, message: '消息发送超过2分钟，无法撤回' })
        }
        
        // 更新消息状态为已撤回
        sql = `UPDATE message SET is_recalled=1 WHERE id=?`
        await Query(sql, [message_id])
        
        // 判断是群聊还是私聊，并获取操作者和发送者的显示名称
        let operatorDisplayName = '用户'
        let senderDisplayName = '用户'
        const room = message.room
        const isRecallByOther = !isOwnMessage
        
        // 检查是否是群聊
        sql = `SELECT id FROM group_chat WHERE room=?`
        const groupCheck = await Query(sql, [room])
        const isGroupChat = groupCheck.results && groupCheck.results.length > 0
        
        if (isGroupChat) {
            // 群聊：获取操作者的群聊昵称、个人昵称、用户名（用于系统通知）
            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                   FROM user u
                   LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = (SELECT id FROM group_chat WHERE room=?)
                   WHERE u.id = ?`
            const operatorInfo = await Query(sql, [room, userId])
            if (operatorInfo.results && operatorInfo.results.length > 0) {
                const info = operatorInfo.results[0]
                // 优先级：群聊昵称 > 个人昵称 > 用户名
                operatorDisplayName = info.group_nickname || info.name || info.username || '用户'
            }
            
            // 获取发送者的群聊昵称、个人昵称、用户名
            sql = `SELECT gm.nickname as group_nickname, u.name, u.username
                   FROM user u
                   LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = (SELECT id FROM group_chat WHERE room=?)
                   WHERE u.id = ?`
            const senderInfo = await Query(sql, [room, message.sender_id])
            if (senderInfo.results && senderInfo.results.length > 0) {
                const info = senderInfo.results[0]
                // 优先级：群聊昵称 > 个人昵称 > 用户名
                senderDisplayName = info.group_nickname || info.name || info.username || '用户'
            }
        } else {
            // 私聊：获取个人昵称或用户名（备注由前端根据当前用户的好友关系查询）
            sql = `SELECT name, username FROM user WHERE id=?`
            const senderInfo = await Query(sql, [message.sender_id])
            if (senderInfo.results && senderInfo.results.length > 0) {
                const info = senderInfo.results[0]
                senderDisplayName = info.name || info.username || '用户'
            }
        }
        
        // 如果是他人撤回的消息（群主或管理员撤回成员消息），发送系统通知
        if (isRecallByOther && isGroupChat) {
            // 创建系统通知消息
            // 格式：{"type":"recall_member_message","operator_id":123,"operator_group_nickname":"xxx","operator_name":"yyy","operator_username":"zzz"}
            const systemContentData = {
                type: 'recall_member_message',
                operator_id: userId,
                operator_group_nickname: operatorDisplayName,
                operator_name: operatorDisplayName,
                operator_username: operatorDisplayName
            }
            const systemContent = JSON.stringify(systemContentData)
            
            // 获取群ID
            sql = `SELECT id FROM group_chat WHERE room=?`
            const groupIdResult = await Query(sql, [room])
            const groupId = groupIdResult.results && groupIdResult.results.length > 0 ? groupIdResult.results[0].id : null
            
            const systemMsg = {
                sender_id: userId,
                receiver_id: groupId || 0,
                type: 'group',
                media_type: 'system',
                content: systemContent,
                room: room,
                file_size: 0,
                status: 0
            }
            sql = 'INSERT INTO message SET ?'
            const systemInsertResult = await Query(sql, systemMsg)
            
            // 如果当前用户是操作者，自动标记为已读
            if (systemInsertResult.results && systemInsertResult.results.insertId) {
                const systemMessageId = systemInsertResult.results.insertId
                sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
                await Query(sql, [systemMessageId, userId])
            }
            
            // 更新消息统计
            sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
            await Query(sql, [room])
            
            // 通过WebSocket广播系统通知给所有群成员
            if (rooms[room]) {
                const systemNotification = {
                    id: systemInsertResult.results.insertId,
                    sender_id: userId,
                    receiver_id: groupId || 0,
                    content: systemContent,
                    room: room,
                    type: 'system',
                    media_type: 'system',
                    created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                    is_recalled: 0
                }
                
                // 广播给房间内所有在线用户
                Object.keys(rooms[room]).forEach(key => {
                    if (rooms[room][key] && rooms[room][key].readyState === 1) {
                        rooms[room][key].send(JSON.stringify(systemNotification))
                    }
                })
            }
        }
        
        // 通知房间内所有用户（撤回通知）
        if (rooms[room]) {
            const recallNotification = {
                type: 'recall',
                message_id: message_id,
                room: room,
                sender_id: message.sender_id,
                operator_id: userId, // 添加操作者ID
                sender_display_name: senderDisplayName,
                operator_display_name: operatorDisplayName,
                is_recall_by_other: isRecallByOther // 标记是否是他人撤回
            }
            Object.keys(rooms[room]).forEach(key => {
                if (rooms[room][key] && rooms[room][key].readyState === 1) {
                    rooms[room][key].send(JSON.stringify(recallNotification))
                }
            })
        }
        
        return RespData(res, { message_id, recalled: true })
    } catch (e) {
        console.error('撤回消息失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 删除消息（只对当前用户生效）
 */
async function DeleteMessage(req, res) {
    const { message_id } = req.body
    const userId = req.user.id
    
    if (!message_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 查询消息是否存在
        let sql = `SELECT id FROM message WHERE id=?`
        let { err, results } = await Query(sql, [message_id])
        
        if (err || !results || results.length === 0) {
            return RespError(res, { code: 4004, message: '消息不存在' })
        }
        
        // 检查是否已经删除过
        sql = `SELECT id FROM deleted_message WHERE message_id=? AND user_id=?`
        let checkResult = await Query(sql, [message_id, userId])
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespData(res, { message_id, deleted: true })
        }
        
        // 插入删除记录
        sql = `INSERT INTO deleted_message (message_id, user_id) VALUES (?, ?)`
        await Query(sql, [message_id, userId])
        
        return RespData(res, { message_id, deleted: true })
    } catch (e) {
        console.error('删除消息失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 删除聊天（仅对已解散的群聊，只对当前用户生效）
 * 删除该聊天中的所有消息记录，并从聊天列表中移除
 */
async function DeleteChat(req, res) {
    const { room } = req.body
    const userId = req.user.id
    
    if (!room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 验证该聊天是否是已解散的群聊
        let sql = `SELECT gc.id, gc.is_disbanded, gc.room 
                   FROM group_chat gc
                   INNER JOIN group_members gm ON gc.id = gm.group_id
                   WHERE gc.room = ? AND gm.user_id = ?`
        let { err, results } = await Query(sql, [room, userId])
        
        if (err) {
            return RespError(res, RespServerErr)
        }
        
        if (!results || results.length === 0) {
            return RespError(res, { code: 4004, message: '群聊不存在或您不是该群聊的成员' })
        }
        
        const groupChat = results[0]
        
        // 检查是否是已解散的群聊
        if (!groupChat.is_disbanded || groupChat.is_disbanded !== 1) {
            return RespError(res, { code: 4003, message: '只能删除已解散的群聊' })
        }
        
        // 获取该聊天中的所有消息ID（排除已经删除的消息）
        sql = `SELECT m.id 
               FROM message m
               LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
               WHERE m.room = ? AND dm.id IS NULL`
        let messageResults = await Query(sql, [userId, room])
        
        if (messageResults.err) {
            return RespError(res, RespServerErr)
        }
        
        // 批量插入删除记录
        if (messageResults.results && messageResults.results.length > 0) {
            const messageIds = messageResults.results.map(r => r.id)
            // 使用批量插入，避免重复插入
            for (const messageId of messageIds) {
                sql = `INSERT IGNORE INTO deleted_message (message_id, user_id) VALUES (?, ?)`
                await Query(sql, [messageId, userId])
            }
        }
        
        // 删除用户的置顶和免打扰设置
        sql = `DELETE FROM pinned_chat WHERE user_id=? AND room=?`
        await Query(sql, [userId, room])
        
        sql = `DELETE FROM muted_chat WHERE user_id=? AND room=?`
        await Query(sql, [userId, room])
        
        return RespData(res, { room, deleted: true })
    } catch (e) {
        console.error('删除聊天失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 置顶聊天
 */
async function PinChat(req, res) {
    const { room } = req.body
    const userId = req.user.id
    
    if (!room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 检查是否已经置顶
        let sql = `SELECT id FROM pinned_chat WHERE user_id=? AND room=?`
        let checkResult = await Query(sql, [userId, room])
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespData(res, { room, pinned: true })
        }
        
        // 插入置顶记录
        sql = `INSERT INTO pinned_chat (user_id, room) VALUES (?, ?)`
        await Query(sql, [userId, room])
        
        return RespData(res, { room, pinned: true })
    } catch (e) {
        console.error('置顶聊天失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 取消置顶聊天
 */
async function UnpinChat(req, res) {
    const { room } = req.body
    const userId = req.user.id
    
    if (!room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 删除置顶记录
        let sql = `DELETE FROM pinned_chat WHERE user_id=? AND room=?`
        await Query(sql, [userId, room])
        
        return RespData(res, { room, unpinned: true })
    } catch (e) {
        console.error('取消置顶聊天失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 消息免打扰
 */
async function MuteChat(req, res) {
    const { room } = req.body
    const userId = req.user.id
    
    if (!room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 检查是否已经免打扰
        let sql = `SELECT id FROM muted_chat WHERE user_id=? AND room=?`
        let checkResult = await Query(sql, [userId, room])
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespData(res, { room, muted: true })
        }
        
        // 插入免打扰记录
        sql = `INSERT INTO muted_chat (user_id, room) VALUES (?, ?)`
        await Query(sql, [userId, room])
        
        return RespData(res, { room, muted: true })
    } catch (e) {
        console.error('设置免打扰失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 取消免打扰（允许消息通知）
 */
async function UnmuteChat(req, res) {
    const { room } = req.body
    const userId = req.user.id
    
    if (!room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 删除免打扰记录
        let sql = `DELETE FROM muted_chat WHERE user_id=? AND room=?`
        await Query(sql, [userId, room])
        
        return RespData(res, { room, unmuted: true })
    } catch (e) {
        console.error('取消免打扰失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 转发消息
 * 将消息转发到指定的聊天房间
 */
async function ForwardMessage(req, res) {
    const { message_id, target_room } = req.body
    const userId = req.user.id
    
    if (!message_id || !target_room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 查询原消息
        let sql = `SELECT * FROM message WHERE id=?`
        let { err, results } = await Query(sql, [message_id])
        
        if (err || !results || results.length === 0) {
            return RespError(res, { code: 4004, message: '消息不存在' })
        }
        
        const originalMessage = results[0]
        
        // 检查消息是否已撤回
        if (originalMessage.is_recalled) {
            return RespError(res, { code: 4005, message: '已撤回的消息无法转发' })
        }
        
        // 确定目标聊天的类型（私聊或群聊）
        let targetType = 'private'
        sql = `SELECT id FROM group_chat WHERE room=?`
        const groupCheck = await Query(sql, [target_room])
        if (groupCheck.results && groupCheck.results.length > 0) {
            targetType = 'group'
        }
        
        // 创建转发消息 - 修复字段映射问题
        const forwardedMsg = {
            sender_id: userId,
            receiver_id: 0, // 初始化接收者ID
            type: targetType, // 使用目标聊天的类型
            media_type: originalMessage.media_type, // 使用原消息的媒体类型
            room: target_room,
            content: originalMessage.content,
            file_size: originalMessage.file_size || 0,
            status: 0,
            is_recalled: 0
        }
        
        // 根据聊天类型设置接收者ID
        if (targetType === 'group') {
            // 群聊：receiver_id 设置为群ID
            forwardedMsg.receiver_id = groupCheck.results[0].id
        } else {
            // 私聊：查找房间中的另一个用户作为接收者
            sql = `SELECT user_id FROM friend WHERE room=? AND user_id != ? LIMIT 1`
            const friendCheck = await Query(sql, [target_room, userId])
            if (friendCheck.results && friendCheck.results.length > 0) {
                forwardedMsg.receiver_id = friendCheck.results[0].user_id
            } else {
                return RespError(res, { code: 4004, message: '目标聊天不存在' })
            }
        }
        
        // 检测单向好友关系和被拉黑情况（仅私聊）
        let isUnidirectionalFriend = false
        let isBlocked = false
        if (targetType === 'private') {
            // 检查发送者是否有接收者的好友关系
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const senderRelation = await Query(sql, [userId, forwardedMsg.receiver_id])
            
            // 检查接收者是否有发送者的好友关系
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const receiverRelation = await Query(sql, [forwardedMsg.receiver_id, userId])
            
            // 如果发送者有接收者的好友关系，但接收者没有发送者的好友关系，则是单向好友关系
            isUnidirectionalFriend = (senderRelation.results && senderRelation.results.length > 0) && 
                                     (!receiverRelation.results || receiverRelation.results.length === 0)
            
            // 检查接收者是否拉黑了发送者（接收者拉黑了发送者）
            sql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
            const blockedCheck = await Query(sql, [forwardedMsg.receiver_id, userId])
            isBlocked = blockedCheck.results && blockedCheck.results.length > 0
        }
        
        // 保存requires_verification和is_blocked标记到数据库（单向好友关系或被拉黑都标记）
        forwardedMsg.requires_verification = (isUnidirectionalFriend || isBlocked) ? 1 : 0
        forwardedMsg.is_blocked = isBlocked ? 1 : 0
        
        // 插入转发消息
        sql = 'INSERT INTO message SET ?'
        const insertResult = await Query(sql, forwardedMsg)
        if (insertResult.err) {
            console.error('插入转发消息失败:', insertResult.err)
            return RespError(res, RespServerErr)
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [target_room])
        
        // 对于群聊，发送者自己的消息自动标记为已读
        if (targetType === 'group') {
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [insertResult.results.insertId, userId])
        }
        
        // 通知目标房间的所有用户
        if (rooms[target_room]) {
            // 获取发送者信息
            let senderInfo = { avatar: null, name: null }
            sql = `SELECT avatar, name FROM user WHERE id=?`
            const senderResp = await Query(sql, [userId])
            if (senderResp.results && senderResp.results[0]) {
                senderInfo.avatar = senderResp.results[0].avatar
                senderInfo.name = senderResp.results[0].name
            }
            
            // 获取原发送者信息
            let originalSenderInfo = { name: null }
            sql = `SELECT name FROM user WHERE id=?`
            const originalSenderResp = await Query(sql, [originalMessage.sender_id])
            if (originalSenderResp.results && originalSenderResp.results[0]) {
                originalSenderInfo.name = originalSenderResp.results[0].name
            }
            
            // 构建转发消息的显示内容
            let displayContent = originalMessage.content
            let displayType = originalMessage.media_type
            
            
            // 构建要发送的消息对象
            const forwardMessage = {
                id: insertResult.results.insertId,
                sender_id: userId,
                receiver_id: forwardedMsg.receiver_id,
                content: displayContent,
                room: target_room,
                avatar: senderInfo.avatar,
                nickname: senderInfo.name || senderResp.results[0]?.username || '用户',
                type: displayType, // 使用原消息的媒体类型
                media_type: originalMessage.media_type,
                file_size: originalMessage.file_size,
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_forwarded: true,
                requires_verification: (isUnidirectionalFriend || isBlocked) ? 1 : 0, // 标记是否需要验证或被拉黑
                is_blocked: isBlocked ? 1 : 0 // 标记是否被拉黑
            }
            
            // 如果是图片或文件类型，添加额外信息用于前端显示
            if (originalMessage.media_type === 'image' || originalMessage.media_type === 'file') {
                forwardMessage.forward_info = {
                    original_sender: originalSenderInfo.name || '用户',
                    original_content: originalMessage.content
                }
            }
            
            // 先发送消息（确保消息在系统通知之前显示）
            for (const key in rooms[target_room]) {
                if (rooms[target_room][key].readyState === 1) {
                    rooms[target_room][key].send(JSON.stringify(forwardMessage))
                }
            }
            
            // 如果是单向好友关系或被拉黑，发送系统通知给发送者（在消息之后发送）
            if (isUnidirectionalFriend || isBlocked) {
                // 获取接收者的显示名称（备注/昵称/用户名）
                sql = `SELECT f.remark, u.name, u.username 
                       FROM friend f 
                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                       LEFT JOIN user u ON u.id = f.user_id
                       WHERE f.user_id = ? AND fg.user_id = ? LIMIT 1`
                const receiverInfoResp = await Query(sql, [forwardedMsg.receiver_id, userId])
                
                let receiverDisplayName = '用户'
                if (receiverInfoResp.results && receiverInfoResp.results.length > 0) {
                    const remark = receiverInfoResp.results[0].remark
                    const name = receiverInfoResp.results[0].name
                    const username = receiverInfoResp.results[0].username
                    // 优先级：备注 > 昵称 > 用户名
                    receiverDisplayName = (remark && remark.trim() && remark !== username) ? remark.trim() : (name || username || '用户')
                } else {
                    // 如果没有好友关系，查询用户基本信息
                    sql = `SELECT name, username FROM user WHERE id=?`
                    const userResp = await Query(sql, [forwardedMsg.receiver_id])
                    if (userResp.results && userResp.results.length > 0) {
                        receiverDisplayName = userResp.results[0].name || userResp.results[0].username || '用户'
                    }
                }
                
                // 创建系统通知消息并保存到数据库
                let systemContent = ''
                if (isBlocked) {
                    // 被拉黑时显示"消息已发出，但被对方拒收了"
                    systemContent = '消息已发出，但被对方拒收了'
                } else {
                    // 单向好友关系时显示"开启了朋友验证"
                    systemContent = `${receiverDisplayName} 开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求。对方验证通过后，才能聊天。发送朋友验证`
                }
                
                const systemMsg = {
                    sender_id: userId,
                    receiver_id: userId, // 系统通知的接收者也是发送者自己
                    type: targetType,
                    media_type: 'system',
                    content: systemContent,
                    room: target_room,
                    file_size: 0,
                    status: 1, // 系统通知默认已读
                    is_recalled: 0,
                    requires_verification: 0
                }
                
                sql = 'INSERT INTO message SET ?'
                const systemInsertResult = await Query(sql, systemMsg)
                if (!systemInsertResult.err) {
                    const systemNotification = {
                        id: systemInsertResult.results.insertId,
                        type: 'system',
                        media_type: 'system',
                        content: systemMsg.content,
                        room: target_room,
                        sender_id: userId,
                        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                    }
                    
                    // 更新消息统计
                    sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
                    await Query(sql, [target_room])
                    
                    // 只发送给发送者（在消息之后发送，确保顺序正确）
                    if (rooms[target_room] && rooms[target_room][userId]) {
                        // 使用 setTimeout 确保消息先显示，系统通知后显示
                        setTimeout(() => {
                            if (rooms[target_room] && rooms[target_room][userId]) {
                                rooms[target_room][userId].send(JSON.stringify(systemNotification))
                            }
                        }, 100)
                    }
                }
            }
        }
        
        return RespData(res, { 
            message_id: insertResult.results.insertId, 
            forwarded: true 
        })
    } catch (e) {
        console.error('转发消息失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 批量转发消息
 * 将多条消息转发到指定的聊天房间
 */
async function ForwardMultiple(req, res) {
    const { message_ids, target_room } = req.body
    const userId = req.user.id
    
    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0 || !target_room) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 查询所有原消息
        const placeholders = message_ids.map(() => '?').join(',')
        let sql = `SELECT * FROM message WHERE id IN (${placeholders}) ORDER BY id ASC`
        let { err, results } = await Query(sql, message_ids)
        
        if (err || !results || results.length === 0) {
            return RespError(res, { code: 4004, message: '消息不存在' })
        }
        
        // 过滤掉已撤回的消息
        const validMessages = results.filter(msg => !msg.is_recalled)
        if (validMessages.length === 0) {
            return RespError(res, { code: 4005, message: '所有消息都已撤回，无法转发' })
        }
        
        // 确定目标聊天的类型（私聊或群聊）
        let targetType = 'private'
        sql = `SELECT id FROM group_chat WHERE room=?`
        const groupCheck = await Query(sql, [target_room])
        if (groupCheck.results && groupCheck.results.length > 0) {
            targetType = 'group'
        }
        
        // 获取原聊天信息（用于生成标题）
        const firstMessage = validMessages[0]
        let originalChatTitle = ''
        let originalChatType = 'private'
        
        // 判断原聊天类型
        sql = `SELECT id FROM group_chat WHERE room=?`
        const originalGroupCheck = await Query(sql, [firstMessage.room])
        if (originalGroupCheck.err) {
            console.error('查询原群聊信息失败:', originalGroupCheck.err)
            return RespError(res, RespServerErr)
        }
        if (originalGroupCheck.results && originalGroupCheck.results.length > 0) {
            originalChatType = 'group'
            sql = `SELECT name FROM group_chat WHERE room=?`
            const groupNameResult = await Query(sql, [firstMessage.room])
            if (groupNameResult.err) {
                console.error('查询群聊名称失败:', groupNameResult.err)
                return RespError(res, RespServerErr)
            }
            if (groupNameResult.results && groupNameResult.results.length > 0) {
                originalChatTitle = groupNameResult.results[0].name || '群聊'
            }
        } else {
            // 私聊，获取对方用户名
            sql = `SELECT user_id FROM friend WHERE room=? AND user_id != ? LIMIT 1`
            const friendCheck = await Query(sql, [firstMessage.room, firstMessage.sender_id])
            if (friendCheck.err) {
                console.error('查询好友关系失败:', friendCheck.err)
                return RespError(res, RespServerErr)
            }
            if (friendCheck.results && friendCheck.results.length > 0) {
                const otherUserId = friendCheck.results[0].user_id
                sql = `SELECT name, username FROM user WHERE id=?`
                const userResult = await Query(sql, [otherUserId])
                if (userResult.err) {
                    console.error('查询用户信息失败:', userResult.err)
                    return RespError(res, RespServerErr)
                }
                if (userResult.results && userResult.results.length > 0) {
                    originalChatTitle = userResult.results[0].name || userResult.results[0].username || '用户'
                }
            }
        }
        
        // 获取所有原消息的发送者信息
        const senderIds = [...new Set(validMessages.map(msg => msg.sender_id))]
        const sendersMap = {}
        if (senderIds.length > 0) {
            const senderPlaceholders = senderIds.map(() => '?').join(',')
            sql = `SELECT id, name, username, avatar FROM user WHERE id IN (${senderPlaceholders})`
            const sendersResult = await Query(sql, senderIds)
            if (sendersResult.err) {
                console.error('查询发送者信息失败:', sendersResult.err)
                return RespError(res, RespServerErr)
            }
            if (sendersResult.results) {
                sendersResult.results.forEach(sender => {
                    sendersMap[sender.id] = sender
                })
            }
        }
        
        // 构建转发消息内容（JSON格式存储多条消息）
        const forwardMessagesData = validMessages.map(msg => {
            const sender = sendersMap[msg.sender_id] || {}
            return {
                id: msg.id,
                sender_id: msg.sender_id,
                sender_name: sender.name || sender.username || '用户',
                sender_avatar: sender.avatar,
                content: msg.content,
                media_type: msg.media_type,
                file_size: msg.file_size,
                created_at: msg.created_at
            }
        })
        
        // 创建转发消息
        const forwardedMsg = {
            sender_id: userId,
            receiver_id: 0,
            type: targetType,
            media_type: 'forward_multiple', // 特殊类型，表示多选转发
            room: target_room,
            content: JSON.stringify({
                chat_title: originalChatTitle,
                chat_type: originalChatType,
                messages: forwardMessagesData
            }),
            file_size: 0,
            status: 0,
            is_recalled: 0
        }
        
        // 根据聊天类型设置接收者ID
        if (targetType === 'group') {
            forwardedMsg.receiver_id = groupCheck.results[0].id
        } else {
            sql = `SELECT user_id FROM friend WHERE room=? AND user_id != ? LIMIT 1`
            const friendCheck = await Query(sql, [target_room, userId])
            if (friendCheck.err) {
                console.error('查询目标好友关系失败:', friendCheck.err)
                return RespError(res, RespServerErr)
            }
            if (friendCheck.results && friendCheck.results.length > 0) {
                forwardedMsg.receiver_id = friendCheck.results[0].user_id
            } else {
                return RespError(res, { code: 4004, message: '目标聊天不存在' })
            }
        }
        
        // 检测单向好友关系和被拉黑情况（仅私聊）
        let isUnidirectionalFriend = false
        let isBlocked = false
        if (targetType === 'private') {
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const senderRelation = await Query(sql, [userId, forwardedMsg.receiver_id])
            if (senderRelation.err) {
                console.error('查询发送者好友关系失败:', senderRelation.err)
                return RespError(res, RespServerErr)
            }
            
            sql = `SELECT f.id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
            const receiverRelation = await Query(sql, [forwardedMsg.receiver_id, userId])
            if (receiverRelation.err) {
                console.error('查询接收者好友关系失败:', receiverRelation.err)
                return RespError(res, RespServerErr)
            }
            
            isUnidirectionalFriend = (senderRelation.results && senderRelation.results.length > 0) && 
                                     (!receiverRelation.results || receiverRelation.results.length === 0)
            
            sql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
            const blockedCheck = await Query(sql, [forwardedMsg.receiver_id, userId])
            if (blockedCheck.err) {
                console.error('查询拉黑关系失败:', blockedCheck.err)
                return RespError(res, RespServerErr)
            }
            isBlocked = blockedCheck.results && blockedCheck.results.length > 0
        }
        
        forwardedMsg.requires_verification = (isUnidirectionalFriend || isBlocked) ? 1 : 0
        forwardedMsg.is_blocked = isBlocked ? 1 : 0
        
        // 插入转发消息
        sql = 'INSERT INTO message SET ?'
        const insertResult = await Query(sql, forwardedMsg)
        if (insertResult.err) {
            console.error('插入转发消息失败:', insertResult.err)
            return RespError(res, RespServerErr)
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [target_room])
        
        // 对于群聊，发送者自己的消息自动标记为已读
        if (targetType === 'group') {
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [insertResult.results.insertId, userId])
        }
        
        // 通知目标房间的所有用户
        if (rooms[target_room]) {
            // 获取发送者信息
            let senderInfo = { avatar: null, name: null }
            sql = `SELECT avatar, name FROM user WHERE id=?`
            const senderResp = await Query(sql, [userId])
            if (senderResp.err) {
                console.error('查询发送者信息失败:', senderResp.err)
                return RespError(res, RespServerErr)
            }
            if (senderResp.results && senderResp.results[0]) {
                senderInfo.avatar = senderResp.results[0].avatar
                senderInfo.name = senderResp.results[0].name
            }
            
            // 构建要发送的消息对象
            const forwardMessage = {
                id: insertResult.results.insertId,
                sender_id: userId,
                receiver_id: forwardedMsg.receiver_id,
                content: forwardedMsg.content,
                room: target_room,
                avatar: senderInfo.avatar,
                nickname: senderInfo.name || senderResp.results[0]?.username || '用户',
                type: 'forward_multiple',
                media_type: 'forward_multiple',
                file_size: 0,
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_forwarded: true,
                forward_info: JSON.parse(forwardedMsg.content),
                requires_verification: (isUnidirectionalFriend || isBlocked) ? 1 : 0,
                is_blocked: isBlocked ? 1 : 0
            }
            
            // 发送给目标房间的所有用户
            for (const key in rooms[target_room]) {
                if (rooms[target_room][key].readyState === 1) {
                    rooms[target_room][key].send(JSON.stringify(forwardMessage))
                }
            }
        }
        
        return RespData(res, { 
            message_id: insertResult.results.insertId, 
            forwarded: true 
        })
    } catch (e) {
        console.error('批量转发消息失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 搜索聊天记录
 * 支持按关键词搜索、按类型筛选（图片、文件）、按日期筛选
 */
async function SearchChatHistory(req, res) {
    const { room, type, keyword, media_type, date } = req.query
    const userId = req.user.id
    
    if (!room || !type) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        let sql
        let params = [room, type, userId]
        
        // 基础查询：排除已删除、已撤回和系统通知的消息
        if (type === 'group') {
            // 使用 LEFT JOIN 确保即使用户已退出群聊（group_members 中没有记录），也能返回消息
            // 注意：LEFT JOIN group_members 会返回 NULL，但消息仍然会被返回
            sql = `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.room, m.media_type, m.file_size, m.created_at, 
                          u.avatar, u.name, u.username, gm.nickname
                   FROM (
                       SELECT id, sender_id, receiver_id, content, room, media_type, file_size, created_at, is_recalled
                       FROM message 
                       WHERE room = ? AND type = ? AND is_recalled = 0 AND media_type != 'system'
                   ) AS m 
                   LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                   LEFT JOIN user u ON u.id = m.sender_id 
                   LEFT JOIN group_members gm ON gm.group_id = (SELECT id FROM group_chat WHERE room=?) AND gm.user_id = m.sender_id 
                   WHERE dm.id IS NULL`
            params.push(room)
        } else {
            sql = `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.room, m.media_type, m.file_size, m.created_at,
                          u.avatar, u.name, u.username, f.remark
                   FROM (
                       SELECT id, sender_id, receiver_id, content, room, media_type, file_size, created_at, is_recalled, requires_verification, is_blocked
                       FROM message 
                       WHERE room = ? AND type = ? AND is_recalled = 0 AND media_type != 'system'
                       AND requires_verification = 0
                       AND is_blocked = 0
                   ) AS m 
                   LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                   LEFT JOIN user u ON u.id = m.sender_id 
                   LEFT JOIN friend f ON f.user_id = m.sender_id AND f.room = m.room
                   LEFT JOIN friend_group fg ON f.group_id = fg.id AND fg.user_id = ?
                   WHERE dm.id IS NULL`
            params.push(userId, userId)
        }
        
        // 添加类型筛选
        if (media_type && (media_type === 'image' || media_type === 'file')) {
            sql += ' AND m.media_type = ?'
            params.push(media_type)
        }
        
        // 添加日期筛选
        if (date) {
            // date格式：YYYY-MM-DD
            sql += ' AND DATE(m.created_at) = ?'
            params.push(date)
        }
        
        // 添加关键词搜索
        if (keyword && keyword.trim()) {
            sql += ' AND m.content LIKE ?'
            params.push(`%${keyword.trim()}%`)
        }
        
        // 按时间倒序排列（最新的在前）
        sql += ' ORDER BY m.created_at DESC'
        
        const { err, results } = await Query(sql, params)
        
        if (err) {
            console.error('查询聊天记录失败:', err)
            return RespError(res, RespServerErr)
        }
        
        // 格式化返回数据
        const formattedResults = results.map(item => {
            const displayName = type === 'group' 
                ? (item.nickname || item.name || item.username || '用户')
                : (item.remark && item.remark.trim() && item.remark !== item.username 
                    ? item.remark 
                    : (item.name || item.username || '用户'))
            
            return {
                id: item.id,
                sender_id: item.sender_id,
                receiver_id: item.receiver_id,
                content: item.content,
                room: item.room,
                media_type: item.media_type,
                file_size: item.file_size ? formatBytes(item.file_size) : null,
                created_at: new Date(item.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                created_at_date: (() => {
                    // 使用本地时区格式化日期，避免时区偏移
                    const d = new Date(item.created_at)
                    const year = d.getFullYear()
                    const month = String(d.getMonth() + 1).padStart(2, '0')
                    const day = String(d.getDate()).padStart(2, '0')
                    return `${year}-${month}-${day}`
                })(), // 用于日期筛选
                avatar: item.avatar,
                nickname: displayName,
                name: item.name,
                username: item.username
            }
        })
        
        // 获取有消息的日期列表（用于日历显示）
        // 始终返回日期列表，不受筛选条件影响，这样日历可以显示所有有消息的日期
        let dateList = []
        let dateSql
        let dateParams
        if (type === 'group') {
            dateSql = `SELECT DISTINCT DATE(created_at) as date 
                      FROM message 
                      WHERE room = ? AND type = ? AND is_recalled = 0
                      AND id NOT IN (SELECT message_id FROM deleted_message WHERE user_id = ?)
                      ORDER BY date DESC`
            dateParams = [room, type, userId]
        } else {
            // 对于私聊，也需要过滤掉单向好友关系时发送的消息
            dateSql = `SELECT DISTINCT DATE(created_at) as date 
                      FROM message 
                      WHERE room = ? AND type = ? AND is_recalled = 0
                      AND id NOT IN (SELECT message_id FROM deleted_message WHERE user_id = ?)
                      AND requires_verification = 0
                      ORDER BY date DESC`
            dateParams = [room, type, userId]
        }
        const dateResult = await Query(dateSql, dateParams)
        if (!dateResult.err && dateResult.results) {
            // 确保日期格式为 YYYY-MM-DD，使用本地时区避免日期偏移
            dateList = dateResult.results.map(r => {
                // 如果 r.date 已经是字符串格式 YYYY-MM-DD，直接使用
                if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
                    return r.date
                }
                // 如果是 Date 对象，使用本地时区格式化
                const d = new Date(r.date)
                const year = d.getFullYear()
                const month = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                return `${year}-${month}-${day}`
            })
        }
        
        return RespData(res, {
            messages: formattedResults,
            dates: dateList
        })
    } catch (e) {
        console.error('搜索聊天记录失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 标记@消息已读
 */
async function MarkMentionRead(req, res) {
    const { message_id } = req.body
    const userId = req.user.id
    
    if (!message_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    try {
        // 检查消息是否存在
        let sql = `SELECT id FROM message WHERE id=?`
        let { err, results } = await Query(sql, [message_id])
        
        if (err || !results || results.length === 0) {
            return RespError(res, { code: 4004, message: '消息不存在' })
        }
        
        // 检查是否已经标记为已读
        sql = `SELECT id FROM message_mention_read WHERE message_id=? AND user_id=?`
        let checkResult = await Query(sql, [message_id, userId])
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespData(res, { message_id, read: true })
        }
        
        // 插入已读记录
        sql = `INSERT INTO message_mention_read (message_id, user_id) VALUES (?, ?)`
        await Query(sql, [message_id, userId])
        
        return RespData(res, { message_id, read: true })
    } catch (e) {
        console.error('标记@消息已读失败:', e)
        return RespError(res, RespServerErr)
    }
}

