module.exports = {
    List,
    AddFriend,
    SearchUser,
    getFriendInfo,
    createFriendGroup,
    updateFriendGroup,
    updateFriendInfo,
    getFriendGroupList,
    getUserInfo,
    updateFriendRemark,
    SendFriendRequest,
    GetFriendRequests,
    RespondFriendRequest,
    DeleteFriend,
    BlockFriend,
    UnblockFriend,
    GetBlacklist,
    GetRecommendations,
    GetRecommendationReason
};

const { RespParamErr, RespServerErr, RespExitFriendErr, RespUpdateErr, RespCreateErr } = require('../../model/error');
const { v4: uuidv4 } = require('uuid');
const { RespError, RespSuccess, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');
const { rooms } = require('../message/index'); // 导入rooms，用于实时发送系统通知

// 导入DeepSeek API（动态导入，避免API Key未配置时出错）
let chatCompletion = null
try {
    const deepseekModule = require('../deepseek/index')
    if (deepseekModule && deepseekModule.chatCompletion) {
        chatCompletion = deepseekModule.chatCompletion
    }
} catch (e) {
    console.warn('DeepSeek模块加载失败，AI推荐功能将不可用:', e.message)
}

const DEFAULT_FRIEND_GROUP_NAME = '我的好友';

async function fetchUserById(userId) {
    const sql = 'SELECT id, username, name, email, avatar FROM user WHERE id=?'
    const { err, results } = await Query(sql, [userId])
    if (err) throw err
    if (!results || results.length === 0) return null
    return results[0]
}

async function ensureDefaultFriendGroup(userId) {
    const selectSql = 'SELECT id FROM friend_group WHERE user_id=? ORDER BY id ASC LIMIT 1'
    let { err, results } = await Query(selectSql, [userId])
    if (err) throw err
    if (results.length > 0) {
        return results[0].id
    }

    const userInfo = await fetchUserById(userId)
    if (!userInfo) {
        throw new Error('USER_NOT_FOUND')
    }

    const groupInfo = {
        user_id: userId,
        username: userInfo.username,
        name: DEFAULT_FRIEND_GROUP_NAME
    }
    const insertRes = await Query('INSERT INTO friend_group SET ?', groupInfo)
    if (insertRes.err) throw insertRes.err
    return insertRes.results.insertId
}

async function findFriendRelation(ownerId, targetId) {
    const sql = `SELECT f.id, f.room FROM friend f 
                 INNER JOIN friend_group fg ON f.group_id = fg.id 
                 WHERE fg.user_id = ? AND f.user_id = ? LIMIT 1`
    const { err, results } = await Query(sql, [ownerId, targetId])
    if (err) throw err
    if (results.length > 0) {
        return { exists: true, room: results[0].room }
    }
    return { exists: false, room: null }
}

async function createMutualFriendship(userA, userB, options = {}) {
    const {
        remarkForA = null,
        remarkForB = null,
        initiatorId = userA.id
    } = options

    const relationA = await findFriendRelation(userA.id, userB.id)
    const relationB = await findFriendRelation(userB.id, userA.id)
    let room = relationA.room || relationB.room || uuidv4()
    let createdNewRelation = false

    if (!relationA.exists) {
        const groupIdA = await ensureDefaultFriendGroup(userA.id)
        const insertA = await Query('INSERT INTO friend SET ?', {
            user_id: userB.id,
            username: userB.username,
            remark: remarkForA || null,
            group_id: groupIdA,
            room
        })
        if (insertA.err) throw insertA.err
        createdNewRelation = true
    }

    if (!relationB.exists) {
        const groupIdB = await ensureDefaultFriendGroup(userB.id)
        const insertB = await Query('INSERT INTO friend SET ?', {
            user_id: userA.id,
            username: userA.username,
            remark: remarkForB || null,
            group_id: groupIdB,
            room
        })
        if (insertB.err) throw insertB.err
        createdNewRelation = true
    }

    if (createdNewRelation && room) {
        // 获取双方的显示名称（优先级：备注 > 昵称 > 用户名）
        // 对于 userA，获取 userB 的显示名称
        let userBDisplayName = remarkForA || userB.name || userB.username || '用户'
        
        // 对于 userB，获取 userA 的显示名称
        let userADisplayName = remarkForB || userA.name || userA.username || '用户'
        
        // 为 userA 创建系统通知
        const systemMsgForA = {
            sender_id: userA.id,
            receiver_id: userA.id,
            type: 'private',
            media_type: 'system',
            content: `你和${userBDisplayName}已成为好友，现在可以开始聊天了`,
            room: room,
            file_size: 0,
            status: 1, // 系统通知默认已读
            is_recalled: 0,
            requires_verification: 0
        }
        
        // 为 userB 创建系统通知
        const systemMsgForB = {
            sender_id: userB.id,
            receiver_id: userB.id,
            type: 'private',
            media_type: 'system',
            content: `你和${userADisplayName}已成为好友，现在可以开始聊天了`,
            room: room,
            file_size: 0,
            status: 1, // 系统通知默认已读
            is_recalled: 0,
            requires_verification: 0
        }
        
        // 插入系统通知到数据库
        const msgResForA = await Query('INSERT INTO message SET ?', systemMsgForA)
        const msgResForB = await Query('INSERT INTO message SET ?', systemMsgForB)
        
        if (!msgResForA.err && !msgResForB.err) {
            // 更新消息统计（两条系统通知）
            // 检查 message_statistics 是否已存在
            const statsCheck = await Query('SELECT id FROM message_statistics WHERE room=?', [room])
            if (statsCheck.results && statsCheck.results.length > 0) {
                // 如果已存在，更新总数
                await Query('UPDATE message_statistics SET total=total+2, updated_at=CURRENT_TIMESTAMP WHERE room=?', [room])
            } else {
                // 如果不存在，插入新记录
                await Query('INSERT INTO message_statistics SET ?', { room, total: 2 })
            }
            
            // 通过 WebSocket 实时发送系统通知给双方
            const systemNotificationForA = {
                id: msgResForA.results.insertId,
                type: 'system',
                content: systemMsgForA.content,
                room: room,
                sender_id: userA.id,
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
            }
            
            const systemNotificationForB = {
                id: msgResForB.results.insertId,
                type: 'system',
                content: systemMsgForB.content,
                room: room,
                sender_id: userB.id,
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
            }
            
            // 发送给 userA
            if (rooms[room] && rooms[room][userA.id]) {
                rooms[room][userA.id].send(JSON.stringify(systemNotificationForA))
            }
            
            // 发送给 userB
            if (rooms[room] && rooms[room][userB.id]) {
                rooms[room][userB.id].send(JSON.stringify(systemNotificationForB))
            }
        }
    }

    return { room, created: createdNewRelation }
}

/**
 * 获取好友列表
 * 1.根据当前用户的id获取其所有好友分组的id和name
 * 2.然后再根据getFriendList传入好友分组的id获得相应的好友,最后插入到friendList中
 */
async function List(req, res) {
    //根据id获取所有分组下的所有好友
    let id = req.user.id
    const sql = 'SELECT id,name FROM friend_group WHERE user_id=?'
    let { err, results } = await Query(sql, [id])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    // 查询数据成功
    let friendList = []
    if (results.length != 0) {
        // 优化：一次性查询所有分组的好友，避免循环查询
        const groupIds = results.map(item => item.id)
        if (groupIds.length > 0) {
            const placeholders = groupIds.map(() => '?').join(',')
            // 一次性查询所有分组的好友
            // 只查询当前用户的好友关系，不要求双向（允许单向好友关系）
            const sql = `SELECT f.id, f.user_id, f.group_id, f.room, f.remark, 
                                COALESCE(u.username, f.username) as username,
                                u.avatar, u.name, u.email,
                                CASE WHEN bf.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
                         FROM friend f 
                         LEFT JOIN user u ON f.user_id = u.id 
                         LEFT JOIN blocked_friend bf ON bf.blocker_id = ? AND bf.blocked_id = f.user_id
                         WHERE f.group_id IN (${placeholders})`
            let { results: allFriends } = await Query(sql, [id, ...groupIds])
            
            // 处理显示名称：优先使用备注，如果没有备注则使用昵称，最后使用用户名
            if (allFriends) {
                allFriends = allFriends.map(item => {
                    // remark 是当前用户对该好友的备注，如果备注为空字符串或等于用户名，则视为未设置备注
                    const remark = item.remark && item.remark.trim() && item.remark !== item.username ? item.remark : null
                    item.remark = remark // 更新remark字段，确保空字符串或等于用户名时设为null
                    item.display_name = remark || item.name || item.username
                    item.is_blocked = item.is_blocked === 1 || item.is_blocked === '1' ? 1 : 0
                    return item
                })
            }
            
            // 按分组组织好友数据
            const friendsByGroup = new Map()
            if (allFriends) {
                allFriends.forEach(friend => {
                    const groupId = friend.group_id
                    if (!friendsByGroup.has(groupId)) {
                        friendsByGroup.set(groupId, [])
                    }
                    friendsByGroup.get(groupId).push(friend)
                })
            }
            
            // 构建返回结果
            for (const item of results) {
                let friend = { name: item.name, friend: friendsByGroup.get(item.id) || [] }
                friendList.push(friend)
            }
        }
    }
    return RespData(res, friendList)
}

/**
 * 添加好友
 * 1.先判断当前好友是否已经是自己的好友了
 * 2.不存在则插入friend表中
 * 3.并将自己也插入到别人的好友列表中
 * 4.当前用户向对方发送一条消息,也就是向message表插入一条数据
 */
async function AddFriend(req, res) {
    try {
        const currentUserId = req.user.id
        let { id: targetUserId, username: targetUsername, remark } = req.body

        if (!targetUserId && !targetUsername) {
            return RespError(res, RespParamErr)
        }

        if (targetUserId) {
            targetUserId = Number(targetUserId)
        }

        if (targetUserId && targetUserId === currentUserId) {
            return RespError(res, { code: 4002, message: '不能添加自己为好友' })
        }

        let targetUser
        if (targetUserId) {
            targetUser = await fetchUserById(targetUserId)
        } else if (targetUsername) {
            const userSql = 'SELECT id, username, name, email, avatar FROM user WHERE username=?'
            const targetRes = await Query(userSql, [targetUsername])
            if (targetRes.err) return RespError(res, RespServerErr)
            targetUser = targetRes.results && targetRes.results[0] ? targetRes.results[0] : null
        }

        if (!targetUser) {
            return RespError(res, { code: 4001, message: '用户不存在' })
        }

        if (targetUser.id === currentUserId) {
            return RespError(res, { code: 4002, message: '不能添加自己为好友' })
        }

        const relation = await findFriendRelation(currentUserId, targetUser.id)
        if (relation.exists) {
            return RespError(res, RespExitFriendErr)
        }

        const currentUserInfo = await fetchUserById(currentUserId)
        if (!currentUserInfo) {
            return RespError(res, RespServerErr)
        }

        const { room } = await createMutualFriendship(
            currentUserInfo,
            targetUser,
            {
                remarkForA: remark || null,
                remarkForB: null,
                initiatorId: currentUserId
            }
        )

        return RespData(res, {
            room,
            user_id: targetUser.id,
            name: targetUser.name || targetUser.username,
            receiver_name: targetUser.name || targetUser.username
        })
    } catch (error) {
        console.error('AddFriend错误:', error)
        return RespError(res, RespServerErr)
    }
}

/**
 * 查询用户
 * 1.支持用户名或邮箱搜索
 * 2.判断查询出来的数据中,判断是否存在已经好友的现象
 * 3.筛选出已经是好友的和不是好友的
 */
async function SearchUser(req, res) {
    const { keyword } = req.query // 支持用户名、邮箱或群id搜索
    if (!keyword || !keyword.trim()) {
        return RespError(res, RespParamErr)
    }

    const searchKeyword = keyword.trim()
    
    // 判断是否是群id（8-10位数字）
    const isGroupCode = /^\d{8,10}$/.test(searchKeyword)
    
    if (isGroupCode) {
        // 群id精准查询
        let sql = `SELECT gc.*, 
                          (SELECT COUNT(*) FROM group_members WHERE group_id = gc.id) as member_count
                   FROM group_chat gc 
                   WHERE gc.group_code = ? AND (gc.is_disbanded IS NULL OR gc.is_disbanded = 0)`
        let { err, results } = await Query(sql, [searchKeyword])
        if (err) return RespError(res, RespServerErr)
        
        if (results.length === 0) {
            return RespData(res, [])
        }
        
        const groupInfo = results[0]
        const { id: currentUserId } = req.user
        
        // 检查用户是否已加入该群
        sql = 'SELECT user_id FROM group_members WHERE group_id=? AND user_id=?'
        const memberCheck = await Query(sql, [groupInfo.id, currentUserId])
        const isMember = !memberCheck.err && memberCheck.results && memberCheck.results.length > 0
        
        // 查询群成员列表（最多显示前20个）
        sql = `SELECT gm.user_id, gm.nickname as group_nickname, u.avatar, u.name, u.username,
                      (SELECT f.remark 
                       FROM friend f 
                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                       WHERE f.user_id = gm.user_id AND fg.user_id = ?
                       LIMIT 1) as friend_remark
               FROM group_members gm 
               LEFT JOIN user u ON gm.user_id = u.id 
               WHERE gm.group_id = ? 
               ORDER BY gm.created_at ASC 
               LIMIT 20`
        const membersResp = await Query(sql, [currentUserId, groupInfo.id])
        const members = membersResp.err ? [] : (membersResp.results || [])
        
        // 格式化成员信息
        const formattedMembers = members.map(m => {
            // 获取显示名称（优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名）
            let displayName = m.group_nickname
            if (!displayName || displayName === m.name) {
                displayName = m.friend_remark || m.name || m.username || '用户'
            }
            return {
                user_id: m.user_id,
                nickname: displayName,
                avatar: m.avatar || '',
                name: m.name || '',
                username: m.username || ''
            }
        })
        
        return RespData(res, [{
            type: 'group',
            id: groupInfo.id,
            group_code: groupInfo.group_code,
            name: groupInfo.name,
            avatar: groupInfo.avatar || '',
            member_count: groupInfo.member_count || 0,
            members: formattedMembers,
            created_at: groupInfo.created_at,
            is_member: isMember
        }])
    }
    
    // 判断是邮箱还是用户名（简单判断：包含@就是邮箱）
    let sql
    let params
    if (searchKeyword.includes('@')) {
        // 邮箱精准匹配
        sql = 'SELECT * FROM user WHERE email = ?'
    } else {
        // 用户名精准匹配
        sql = 'SELECT * FROM user WHERE username = ?'
    }
    params = [searchKeyword]

    let { err, results } = await Query(sql, params)
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)

    let searchList = []
    if (results.length !== 0) {
        const { id: currentUserId, username: currentUsername } = req.user
        const groupSql = 'SELECT id FROM friend_group WHERE user_id=?'
        let groupsResult = await Query(groupSql, [currentUserId])
        if (groupsResult.err) {
            return RespError(res, RespServerErr)
        }

        const groupIds = groupsResult.results.map(item => item.id)
        for (const userInfo of results) {
            if (userInfo.username === currentUsername) {
                // 跳过自己
                continue
            }
            let flag = false
            for (const groupId of groupIds) {
                let friends = await getFriendList(groupId, currentUserId)
                for (const item2 of friends) {
                    if (item2.username === userInfo.username) {
                        flag = true
                        break
                    }
                }
                if (flag) break
            }

            let outgoingRequestStatus = null
            let outgoingRequestId = null
            let incomingRequestStatus = null
            let incomingRequestId = null

            if (!flag) {
                const outgoingSql = `SELECT id, status FROM friend_request 
                                     WHERE sender_id=? AND receiver_id=? 
                                     ORDER BY created_at DESC LIMIT 1`
                const outgoingRes = await Query(outgoingSql, [currentUserId, userInfo.id])
                if (!outgoingRes.err && outgoingRes.results.length > 0) {
                    outgoingRequestStatus = outgoingRes.results[0].status
                    outgoingRequestId = outgoingRes.results[0].id
                }

                const incomingSql = `SELECT id, status FROM friend_request 
                                     WHERE sender_id=? AND receiver_id=? 
                                     ORDER BY created_at DESC LIMIT 1`
                const incomingRes = await Query(incomingSql, [userInfo.id, currentUserId])
                if (!incomingRes.err && incomingRes.results.length > 0) {
                    incomingRequestStatus = incomingRes.results[0].status
                    incomingRequestId = incomingRes.results[0].id
                }
            }

            searchList.push({
                type: 'user',
                name: userInfo.name,
                username: userInfo.username,
                email: userInfo.email || '',
                avatar: userInfo.avatar || '',
                status: flag,
                id: userInfo.id,
                requestStatus: outgoingRequestStatus,
                requestId: outgoingRequestId,
                incomingRequestStatus,
                incomingRequestId
            })
        }
    }
    RespData(res, searchList)
}

/**
 * 获取好友信息
 * 1.获取用户账号,昵称,备注,分组.个性签名,头像
 * 2.根据group_id和user_id查询friend表,获取user_id,username,remark和group_id
 * 3.根据user表获取头像,个性签名,昵称
 */
async function getFriendInfo(req, res) {
    const { group_id, user_id } = req.query
    let sql = 'SELECT user_id,room,user.username,user.signature,user.avatar,user.name,remark,group_id FROM friend,user WHERE group_id=? AND friend.user_id=? AND user.id=?'
    let { err, results } = await Query(sql, [group_id, user_id, user_id])
    let userInfo = {
        user_id: "",
        username: "",
        avatar: "",
        name: "",
        remark: "",
        group_id: "",
        signature: "",
        room: "",
    }
    if (results.length > 0) {
        userInfo = results[0]
    }
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    RespData(res, userInfo)
}

/**
 * 发送好友申请
 */
async function SendFriendRequest(req, res) {
    let { receiver_id, greeting, remark } = req.body
    const senderId = req.user.id

    if (!receiver_id) {
        return RespError(res, RespParamErr)
    }

    receiver_id = Number(receiver_id)
    if (receiver_id === senderId) {
        return RespError(res, { code: 4002, message: '不能向自己发送好友申请' })
    }

    try {
        const receiverInfo = await fetchUserById(receiver_id)
        if (!receiverInfo) {
            return RespError(res, { code: 4001, message: '用户不存在' })
        }

        // 检查双方是否互为好友（双向好友关系）
        // 只有当双方都不是好友时，或者只有单向好友关系时，才允许发送申请
        const senderToReceiver = await findFriendRelation(senderId, receiver_id)
        const receiverToSender = await findFriendRelation(receiver_id, senderId)
        
        // 如果双方互为好友，则不允许发送申请
        if (senderToReceiver.exists && receiverToSender.exists) {
            return RespError(res, { code: 4006, message: '对方已经是您的好友' })
        }

        const pendingOutgoing = await Query(
            `SELECT id FROM friend_request WHERE sender_id=? AND receiver_id=? AND status='pending' LIMIT 1`,
            [senderId, receiver_id]
        )
        if (pendingOutgoing.err) return RespError(res, RespServerErr)
        if (pendingOutgoing.results.length > 0) {
            return RespError(res, { code: 4006, message: '好友申请已发送，请等待对方确认' })
        }

        const pendingIncoming = await Query(
            `SELECT id FROM friend_request WHERE sender_id=? AND receiver_id=? AND status='pending' LIMIT 1`,
            [receiver_id, senderId]
        )
        if (pendingIncoming.err) return RespError(res, RespServerErr)
        if (pendingIncoming.results.length > 0) {
            return RespError(res, { code: 4006, message: '对方已向您发送好友申请，请在申请列表中处理' })
        }

        const insertRes = await Query('INSERT INTO friend_request SET ?', {
            sender_id: senderId,
            receiver_id,
            greeting: greeting || '',
            remark: remark || '',
            status: 'pending'
        })
        if (insertRes.err) {
            return RespError(res, RespCreateErr)
        }

        return RespData(res, {
            id: insertRes.results.insertId,
            status: 'pending',
            receiver_id,
            receiver: {
                id: receiverInfo.id,
                username: receiverInfo.username,
                name: receiverInfo.name,
                email: receiverInfo.email,
                avatar: receiverInfo.avatar
            }
        })
    } catch (error) {
        console.error('发送好友申请失败:', error)
        return RespError(res, RespServerErr)
    }
}

/**
 * 获取好友申请列表（已发送 / 已收到）
 */
async function GetFriendRequests(req, res) {
    const userId = req.user.id
    try {
        const sentSql = `SELECT fr.*, 
                                u.username AS receiver_username,
                                u.name AS receiver_name,
                                u.email AS receiver_email,
                                u.avatar AS receiver_avatar
                         FROM friend_request fr
                         INNER JOIN user u ON fr.receiver_id = u.id
                         WHERE fr.sender_id=?
                         ORDER BY fr.created_at DESC`
        const receivedSql = `SELECT fr.*, 
                                    u.username AS sender_username,
                                    u.name AS sender_name,
                                    u.email AS sender_email,
                                    u.avatar AS sender_avatar
                             FROM friend_request fr
                             INNER JOIN user u ON fr.sender_id = u.id
                             LEFT JOIN blocked_friend bf ON bf.blocker_id = ? AND bf.blocked_id = fr.sender_id
                             WHERE fr.receiver_id=? AND bf.id IS NULL
                             ORDER BY fr.created_at DESC`

        const [sentRes, receivedRes] = await Promise.all([
            Query(sentSql, [userId]),
            Query(receivedSql, [userId, userId])
        ])

        if (sentRes.err || receivedRes.err) {
            return RespError(res, RespServerErr)
        }

        const formatSent = (sentRes.results || []).map(item => ({
            id: item.id,
            sender_id: item.sender_id,
            receiver_id: item.receiver_id,
            status: item.status,
            greeting: item.greeting || '',
            remark: item.remark || '',
            created_at: item.created_at,
            handled_at: item.handled_at,
            receiver: {
                id: item.receiver_id,
                username: item.receiver_username,
                name: item.receiver_name,
                email: item.receiver_email,
                avatar: item.receiver_avatar
            }
        }))

        const formatReceived = (receivedRes.results || []).map(item => ({
            id: item.id,
            sender_id: item.sender_id,
            receiver_id: item.receiver_id,
            status: item.status,
            greeting: item.greeting || '',
            remark: item.remark || '',
            created_at: item.created_at,
            handled_at: item.handled_at,
            sender: {
                id: item.sender_id,
                username: item.sender_username,
                name: item.sender_name,
                email: item.sender_email,
                avatar: item.sender_avatar
            }
        }))

        return RespData(res, {
            sent: formatSent,
            received: formatReceived
        })
    } catch (error) {
        console.error('获取好友申请列表失败:', error)
        return RespError(res, RespServerErr)
    }
}

/**
 * 处理好友申请
 */
async function RespondFriendRequest(req, res) {
    const userId = req.user.id
    const { request_id, action } = req.body

    if (!request_id || !['accept', 'reject'].includes(action)) {
        return RespError(res, RespParamErr)
    }

    try {
        const requestRes = await Query('SELECT * FROM friend_request WHERE id=?', [request_id])
        if (requestRes.err) {
            return RespError(res, RespServerErr)
        }
        if (!requestRes.results || requestRes.results.length === 0) {
            return RespError(res, { code: 4001, message: '好友申请不存在或已被删除' })
        }
        const request = requestRes.results[0]

        if (request.receiver_id !== userId) {
            return RespError(res, { code: 4002, message: '无权处理该好友申请' })
        }

        if (request.status !== 'pending') {
            return RespError(res, { code: 4002, message: '该好友申请已处理' })
        }

        if (action === 'reject') {
            const rejectRes = await Query(
                `UPDATE friend_request SET status='rejected', handled_at=NOW() WHERE id=? AND status='pending'`,
                [request_id]
            )
            if (rejectRes.err) {
                return RespError(res, RespServerErr)
            }
            if (rejectRes.results.affectedRows === 0) {
                return RespError(res, { code: 4002, message: '该好友申请已处理' })
            }
            return RespSuccess(res)
        }

        // action === 'accept'
        const acceptRes = await Query(
            `UPDATE friend_request SET status='accepted', handled_at=NOW() WHERE id=? AND status='pending'`,
            [request_id]
        )
        if (acceptRes.err) {
            return RespError(res, RespServerErr)
        }
        if (acceptRes.results.affectedRows === 0) {
            return RespError(res, { code: 4002, message: '该好友申请已处理' })
        }

        try {
            const senderInfo = await fetchUserById(request.sender_id)
            const receiverInfo = await fetchUserById(request.receiver_id)
            if (!senderInfo || !receiverInfo) {
                throw new Error('申请双方用户信息缺失')
            }
            await createMutualFriendship(senderInfo, receiverInfo, {
                remarkForA: request.remark || null,
                remarkForB: null,
                initiatorId: userId
            })
        } catch (friendErr) {
            console.error('处理好友申请时创建好友关系失败:', friendErr)
            await Query(`UPDATE friend_request SET status='pending', handled_at=NULL WHERE id=?`, [request_id])
            return RespError(res, RespServerErr)
        }

        return RespSuccess(res)
    } catch (error) {
        console.error('处理好友申请失败:', error)
        return RespError(res, RespServerErr)
    }
}

/**
 * 添加好友分组
 */
async function createFriendGroup(req, res) {
    const friend_group = req.body
    let sql = 'INSERT INTO friend_group SET ?'
    let { err, results } = await Query(sql, friend_group)
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
}

/**
 * 获取当前用户的分组列表
 */
async function getFriendGroupList(req, res) {
    let user_id = req.user.id
    const sql = 'SELECT * FROM friend_group WHERE user_id=?'
    let { err, results } = await Query(sql, [user_id])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    RespData(res, results)
}

/**
 * 重命名好友分组
 */
async function updateFriendGroup(req, res) {
    const { name, user_id, old_name } = req.body
    let sql = 'UPDATE friend_group SET name=? WHERE user_id=? AND name=?'
    let { err, results } = await Query(sql, [name, user_id, old_name])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 修改好友的信息
 */
async function updateFriendInfo(req, res) {
    const { old_group_id, user_id, new_group_id, remark } = req.body
    const current_user_id = req.user.id
    
    // 验证该好友关系是否属于当前用户
    let verifySql = `SELECT f.id FROM friend f 
                     INNER JOIN friend_group fg ON f.group_id = fg.id 
                     WHERE f.user_id = ? AND f.group_id = ? AND fg.user_id = ?`
    let verifyResult = await Query(verifySql, [user_id, old_group_id, current_user_id])
    if (verifyResult.err || !verifyResult.results || verifyResult.results.length === 0) {
        return RespError(res, { code: 4002, message: '无权修改该好友信息' })
    }
    
    let sql = 'UPDATE friend SET group_id=?,remark=? WHERE user_id=? AND group_id=?'
    let { err, results } = await Query(sql, [new_group_id, remark, user_id, old_group_id])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 更新好友备注（仅更新备注，不更新分组）
 */
async function updateFriendRemark(req, res) {
    const { user_id, remark } = req.body
    const current_user_id = req.user.id
    
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    
    // 查找当前用户和该用户的好友关系
    let findSql = `SELECT f.id, f.group_id FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = ? AND fg.user_id = ?`
    let findResult = await Query(findSql, [user_id, current_user_id])
    
    if (findResult.err || !findResult.results || findResult.results.length === 0) {
        return RespError(res, { code: 4002, message: '该用户不是您的好友' })
    }
    
    const group_id = findResult.results[0].group_id
    let sql = 'UPDATE friend SET remark=? WHERE user_id=? AND group_id=?'
    let { err, results } = await Query(sql, [remark, user_id, group_id])
    
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

//查询好友信息
async function getFriendList(group_id, current_user_id) {
    // JOIN user表获取最新的头像、昵称、邮箱、用户名等信息
    // 优先使用备注，如果没有备注则使用昵称，最后使用用户名
    // 使用 COALESCE 确保 username 字段优先使用 user 表的，如果为 NULL 则使用 friend 表的
    // 同时查询是否被拉黑（当前用户拉黑了该好友）
    // 只返回当前用户的好友关系（允许单向好友关系）
    const sql = `SELECT f.id, f.user_id, f.group_id, f.room, f.remark, 
                         COALESCE(u.username, f.username) as username,
                         u.avatar, u.name, u.email,
                         CASE WHEN bf.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
                  FROM friend f 
                  LEFT JOIN user u ON f.user_id = u.id 
                  LEFT JOIN blocked_friend bf ON bf.blocker_id = ? AND bf.blocked_id = f.user_id
                  WHERE f.group_id=?`
    let { results } = await Query(sql, [current_user_id, group_id])
    // 处理显示名称：优先使用备注，如果没有备注则使用昵称，最后使用用户名
    results = results.map(item => {
        // remark 是当前用户对该好友的备注，如果备注为空字符串或等于用户名，则视为未设置备注
        const remark = item.remark && item.remark.trim() && item.remark !== item.username ? item.remark : null
        item.remark = remark // 更新remark字段，确保空字符串或等于用户名时设为null
        item.display_name = remark || item.name || item.username
        item.is_blocked = item.is_blocked === 1 || item.is_blocked === '1' ? 1 : 0
        return item
    })
    return results
}

//添加好友
async function addFriend(friendInfo) {
    const sqlStr = 'INSERT INTO friend SET ?'
    let { err, results } = await Query(sqlStr, friendInfo)
    // 执行 SQL 语句失败了
    if (err) return err
    if (results.affectedRows === 1) {
        return ""
    }
    return "创建失败"
}

/**
 * 获取用户信息（通过用户ID）
 * 返回用户的基本信息：id, username, name, avatar
 * 如果当前用户和该用户是好友关系，同时返回备注信息
 */
async function getUserInfo(req, res) {
    const { user_id } = req.query
    const current_user_id = req.user.id
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    // 获取用户基本信息（包括邮箱、个性签名和兴趣爱好）
    const sql = 'SELECT id, username, name, avatar, email, signature, interests FROM user WHERE id=?'
    let { err, results } = await Query(sql, [user_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '用户不存在' })
    }
    let userInfo = results[0]
    
    // 查询当前用户对该用户的备注（如果他们是好友关系）
    // 同时查询是否被拉黑（当前用户拉黑了该用户）
    const remarkSql = `SELECT f.remark, f.group_id,
                              CASE WHEN bf.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
                       FROM friend f 
                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                       LEFT JOIN blocked_friend bf ON bf.blocker_id = ? AND bf.blocked_id = f.user_id
                       WHERE f.user_id = ? AND fg.user_id = ?`
    let remarkResult = await Query(remarkSql, [current_user_id, user_id, current_user_id])
    if (!remarkResult.err && remarkResult.results && remarkResult.results.length > 0) {
        userInfo.remark = remarkResult.results[0].remark
        userInfo.group_id = remarkResult.results[0].group_id
        userInfo.is_friend = true
        userInfo.is_blocked = remarkResult.results[0].is_blocked === 1 || remarkResult.results[0].is_blocked === '1' ? 1 : 0
    } else {
        userInfo.remark = ''
        userInfo.group_id = null
        userInfo.is_friend = false
        // 即使不是好友，也要检查是否被拉黑
        const blockedSql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
        let blockedResult = await Query(blockedSql, [current_user_id, user_id])
        if (!blockedResult.err && blockedResult.results && blockedResult.results.length > 0) {
            userInfo.is_blocked = 1
        } else {
            userInfo.is_blocked = 0
        }
    }
    
    return RespData(res, userInfo)
}

/**
 * 删除好友
 * 1. 只删除当前用户的好友关系，不影响对方的好友列表
 * 2. 清空删除方的所有聊天记录（通过deleted_message表标记）
 * 3. 删除置顶和免打扰设置
 */
async function DeleteFriend(req, res) {
    const { user_id } = req.body
    const current_user_id = req.user.id
    
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    
    // 查找当前用户和该用户的好友关系
    let findSql = `SELECT f.id, f.group_id, f.room FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = ? AND fg.user_id = ?`
    let findResult = await Query(findSql, [user_id, current_user_id])
    
    if (findResult.err || !findResult.results || findResult.results.length === 0) {
        return RespError(res, { code: 4002, message: '该用户不是您的好友' })
    }
    
    const friendRecord = findResult.results[0]
    const room = friendRecord.room
    
    try {
        // 1. 获取该聊天中的所有消息ID（排除已经删除的消息）
        let sql = `SELECT m.id 
                   FROM message m
                   LEFT JOIN deleted_message dm ON m.id = dm.message_id AND dm.user_id = ?
                   WHERE m.room = ? AND m.type = 'private' AND dm.id IS NULL`
        let messageResults = await Query(sql, [current_user_id, room])
        
        if (messageResults.err) {
            return RespError(res, RespServerErr)
        }
        
        // 2. 批量插入删除记录，标记所有消息为已删除
        if (messageResults.results && messageResults.results.length > 0) {
            const messageIds = messageResults.results.map(r => r.id)
            for (const messageId of messageIds) {
                sql = `INSERT IGNORE INTO deleted_message (message_id, user_id) VALUES (?, ?)`
                await Query(sql, [messageId, current_user_id])
            }
        }
        
        // 3. 删除好友关系
        let deleteSql = 'DELETE FROM friend WHERE id = ?'
        let { err, results } = await Query(deleteSql, [friendRecord.id])
        
        if (err) {
            return RespError(res, RespServerErr)
        }
        
        if (results.affectedRows === 0) {
            return RespError(res, RespUpdateErr)
        }
        
        // 4. 删除置顶和免打扰设置
        sql = `DELETE FROM pinned_chat WHERE user_id=? AND room=?`
        await Query(sql, [current_user_id, room])
        
        sql = `DELETE FROM muted_chat WHERE user_id=? AND room=?`
        await Query(sql, [current_user_id, room])
        
        // 5. 检查该 room 是否还有其他好友关系在使用（被删除方的好友关系）
        // 如果被删除方的好友关系还在，说明是单向删除，不删除 message_statistics
        // 如果双方的好友关系都不存在了，删除 message_statistics（虽然这种情况不应该发生，但为了数据一致性）
        let checkOtherRelationSql = `SELECT f.id FROM friend f 
                                     INNER JOIN friend_group fg ON f.group_id = fg.id 
                                     WHERE f.room = ? AND fg.user_id != ? LIMIT 1`
        let checkResult = await Query(checkOtherRelationSql, [room, current_user_id])
        
        if (!checkResult.err && checkResult.results.length === 0) {
            // 没有其他好友关系在使用该 room，删除 message_statistics
            let deleteStatsSql = 'DELETE FROM message_statistics WHERE room = ?'
            await Query(deleteStatsSql, [room])
        }
        
        return RespSuccess(res)
    } catch (e) {
        console.error('删除好友失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 拉黑好友
 * 1. 检查是否是好友关系
 * 2. 添加拉黑记录到blocked_friend表
 * 3. 从聊天列表中移除（通过删除message_statistics或标记）
 * 4. 好友关系保持不变
 */
async function BlockFriend(req, res) {
    const { user_id } = req.body
    const blocker_id = req.user.id
    
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    
    if (user_id === blocker_id) {
        return RespError(res, { code: 4002, message: '不能拉黑自己' })
    }
    
    try {
        // 检查是否是好友关系
        let findSql = `SELECT f.id, f.room FROM friend f 
                       INNER JOIN friend_group fg ON f.group_id = fg.id 
                       WHERE f.user_id = ? AND fg.user_id = ?`
        let findResult = await Query(findSql, [user_id, blocker_id])
        
        if (findResult.err || !findResult.results || findResult.results.length === 0) {
            return RespError(res, { code: 4002, message: '该用户不是您的好友' })
        }
        
        const friendRecord = findResult.results[0]
        const room = friendRecord.room
        
        // 检查是否已经拉黑
        let checkSql = `SELECT id FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ?`
        let checkResult = await Query(checkSql, [blocker_id, user_id])
        
        if (checkResult.err) {
            return RespError(res, RespServerErr)
        }
        
        if (checkResult.results && checkResult.results.length > 0) {
            return RespError(res, { code: 4003, message: '该用户已被拉黑' })
        }
        
        // 添加拉黑记录
        let insertSql = `INSERT INTO blocked_friend (blocker_id, blocked_id) VALUES (?, ?)`
        let insertResult = await Query(insertSql, [blocker_id, user_id])
        
        if (insertResult.err) {
            return RespError(res, RespServerErr)
        }
        
        // 注意：不删除 message_statistics 记录，因为：
        // 1. message_statistics 是共享的（同一个 room 只有一个记录）
        // 2. 删除会影响被拉黑者的聊天列表
        // 3. 聊天列表查询已经通过 NOT EXISTS 子查询过滤了被拉黑的好友
        // 4. 被拉黑者的聊天列表不应该被删除
        
        // 删除置顶和免打扰设置（只删除拉黑者的设置）
        let deletePinnedSql = `DELETE FROM pinned_chat WHERE user_id=? AND room=?`
        await Query(deletePinnedSql, [blocker_id, room])
        
        let deleteMutedSql = `DELETE FROM muted_chat WHERE user_id=? AND room=?`
        await Query(deleteMutedSql, [blocker_id, room])
        
        return RespSuccess(res)
    } catch (e) {
        console.error('拉黑好友失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 取消拉黑好友
 */
async function UnblockFriend(req, res) {
    const { user_id } = req.body
    const blocker_id = req.user.id
    
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    
    try {
        // 删除拉黑记录
        let deleteSql = `DELETE FROM blocked_friend WHERE blocker_id = ? AND blocked_id = ?`
        let deleteResult = await Query(deleteSql, [blocker_id, user_id])
        
        if (deleteResult.err) {
            return RespError(res, RespServerErr)
        }
        
        if (deleteResult.results.affectedRows === 0) {
            return RespError(res, { code: 4002, message: '该用户未被拉黑' })
        }
        
        return RespSuccess(res)
    } catch (e) {
        console.error('取消拉黑好友失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 获取好友推荐
 * 根据兴趣爱好相似度和共同群聊推荐好友
 * 最多返回2个推荐
 */
async function GetRecommendations(req, res) {
    const current_user_id = req.user.id
    
    try {
        // 1. 获取当前用户的兴趣爱好
        const userSql = 'SELECT interests FROM user WHERE id=?'
        const userResult = await Query(userSql, [current_user_id])
        if (userResult.err || !userResult.results || userResult.results.length === 0) {
            return RespData(res, [])
        }
        
        const currentUserInterests = userResult.results[0].interests || ''
        let currentInterestsArray = []
        
        // 解析当前用户的兴趣爱好（可能是JSON数组字符串或逗号分隔字符串）
        if (currentUserInterests) {
            // 确保是字符串类型
            const interestsStr = typeof currentUserInterests === 'string' ? currentUserInterests : String(currentUserInterests)
            
            try {
                const parsed = JSON.parse(interestsStr)
                if (Array.isArray(parsed)) {
                    currentInterestsArray = parsed.filter(t => t && t.trim())
                } else {
                    // 如果不是数组，按逗号分隔字符串处理
                    currentInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                }
            } catch (e) {
                // JSON解析失败，按逗号分隔字符串处理
                currentInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
            }
        }
        
        // 2. 获取当前用户的所有好友ID（排除已经是好友的用户）
        const friendSql = `SELECT f.user_id 
                          FROM friend f 
                          INNER JOIN friend_group fg ON f.group_id = fg.id 
                          WHERE fg.user_id = ?`
        const friendResult = await Query(friendSql, [current_user_id])
        const friendIds = new Set()
        if (!friendResult.err && friendResult.results) {
            friendResult.results.forEach(row => friendIds.add(row.user_id))
        }
        friendIds.add(current_user_id) // 排除自己
        
        // 3. 获取当前用户加入的所有群聊ID
        const groupSql = `SELECT group_id FROM group_members WHERE user_id = ?`
        const groupResult = await Query(groupSql, [current_user_id])
        const userGroupIds = new Set()
        if (!groupResult.err && groupResult.results) {
            groupResult.results.forEach(row => userGroupIds.add(row.group_id))
        }
        
        // 4. 如果用户没有兴趣爱好，尝试根据共同群聊推荐
        if (currentInterestsArray.length === 0 && userGroupIds.size === 0) {
            return RespData(res, [])
        }
        
        // 5. 查询所有其他用户（排除好友和自己）
        const excludeIds = Array.from(friendIds)
        const excludePlaceholders = excludeIds.length > 0 ? excludeIds.map(() => '?').join(',') : 'NULL'
        
        let allUsersSql = `SELECT u.id, u.username, u.name, u.avatar, u.interests
                          FROM user u
                          WHERE u.id NOT IN (${excludePlaceholders})
                          ${excludeIds.length === 0 ? 'AND 1=0' : ''}`
        const allUsersResult = await Query(allUsersSql, excludeIds.length > 0 ? excludeIds : [])
        
        if (allUsersResult.err || !allUsersResult.results) {
            return RespData(res, [])
        }
        
        // 6. 获取所有候选用户的群聊信息
        const allCandidateIds = allUsersResult.results.map(u => u.id)
        let candidates = []
        
        if (allCandidateIds.length > 0) {
            const candidatePlaceholders = allCandidateIds.map(() => '?').join(',')
            
            // 查询共同群聊
            let commonGroupsSql = ''
            let commonGroupsParams = []
            
            if (userGroupIds.size > 0) {
                const groupPlaceholders = Array.from(userGroupIds).map(() => '?').join(',')
                commonGroupsSql = `SELECT gm.user_id, COUNT(DISTINCT gm.group_id) as common_groups
                                  FROM group_members gm
                                  WHERE gm.user_id IN (${candidatePlaceholders})
                                    AND gm.group_id IN (${groupPlaceholders})
                                  GROUP BY gm.user_id`
                commonGroupsParams = [...allCandidateIds, ...Array.from(userGroupIds)]
            }
            
            const commonGroupsMap = new Map()
            if (commonGroupsSql) {
                const commonGroupsResult = await Query(commonGroupsSql, commonGroupsParams)
                if (!commonGroupsResult.err && commonGroupsResult.results) {
                    commonGroupsResult.results.forEach(row => {
                        commonGroupsMap.set(row.user_id, row.common_groups)
                    })
                }
            }
            
            // 构建候选列表
            allUsersResult.results.forEach(user => {
                let candidateInterests = []
                if (user.interests) {
                    // 确保是字符串类型
                    const interestsStr = typeof user.interests === 'string' ? user.interests : String(user.interests)
                    
                    try {
                        const parsed = JSON.parse(interestsStr)
                        if (Array.isArray(parsed)) {
                            candidateInterests = parsed.filter(t => t && t.trim())
                        } else {
                            // 如果不是数组，按逗号分隔字符串处理
                            candidateInterests = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                        }
                    } catch (e) {
                        // JSON解析失败，按逗号分隔字符串处理
                        candidateInterests = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                    }
                }
                
                const commonGroups = commonGroupsMap.get(user.id) || 0
                
                // 计算兴趣爱好相似度
                let commonInterestsCount = 0
                if (currentInterestsArray.length > 0 && candidateInterests.length > 0) {
                    commonInterestsCount = currentInterestsArray.filter(i => candidateInterests.includes(i)).length
                }
                
                // 计算推荐分数
                let score = 0
                score += commonGroups * 10  // 共同群聊加分
                score += commonInterestsCount * 5  // 共同兴趣爱好加分
                
                // 只添加有推荐理由的候选（有共同群聊或共同兴趣爱好）
                if (commonGroups > 0 || commonInterestsCount > 0) {
                    candidates.push({
                        user_id: user.id,
                        username: user.username,
                        name: user.name,
                        avatar: user.avatar,
                        interests: user.interests,
                        common_groups: commonGroups,
                        common_interests: commonInterestsCount,
                        score: score
                    })
                }
            })
        }
        
        // 7. 按分数排序，获取前10个候选（用于AI分析）
        candidates.sort((a, b) => b.score - a.score)
        const topCandidates = candidates.slice(0, 10)
        
        // 8. 如果有候选用户，尝试使用AI推荐
        let useAIRecommendation = false
        let aiRecommended = []
        
        if (topCandidates.length > 0 && chatCompletion) {
            try {
                console.log(`[AI推荐] 开始AI推荐分析，候选用户数: ${topCandidates.length}`)
                
                // 获取当前用户的完整信息（用于AI分析）
                const currentUserSql = 'SELECT name, username, interests FROM user WHERE id=?'
                const currentUserResult = await Query(currentUserSql, [current_user_id])
                const currentUserName = currentUserResult.results?.[0]?.name || currentUserResult.results?.[0]?.username || '用户'
                
                // 构建候选用户信息摘要
                const candidatesInfo = topCandidates.map((c, index) => {
                    let candidateInterests = []
                    if (c.interests) {
                        const interestsStr = typeof c.interests === 'string' ? c.interests : String(c.interests)
                        try {
                            const parsed = JSON.parse(interestsStr)
                            if (Array.isArray(parsed)) {
                                candidateInterests = parsed
                            } else {
                                candidateInterests = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                            }
                        } catch (e) {
                            candidateInterests = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                        }
                    }
                    
                    return {
                        id: c.user_id,
                        name: c.name || c.username,
                        interests: candidateInterests,
                        common_groups: c.common_groups,
                        common_interests: c.common_interests,
                        score: c.score
                    }
                })
                
                console.log(`[AI推荐] 当前用户: ${currentUserName}, 兴趣爱好: ${currentInterestsArray.join('、') || '未设置'}`)
                console.log(`[AI推荐] 候选用户信息:`, candidatesInfo.map(c => `ID:${c.id} ${c.name} (兴趣:${c.interests.join('、') || '无'}, 共同群聊:${c.common_groups}, 共同兴趣:${c.common_interests}, 分数:${c.score})`).join('; '))
                
                // 构建AI提示词
                const prompt = `你是一个好友推荐系统。请根据以下信息，推荐最合适的2个好友。

当前用户信息：
- 姓名：${currentUserName}
- 兴趣爱好：${currentInterestsArray.length > 0 ? currentInterestsArray.join('、') : '未设置'}

候选用户列表：
${candidatesInfo.map((c, i) => `${i + 1}. 用户ID: ${c.id}, 姓名: ${c.name}, 兴趣爱好: ${c.interests.length > 0 ? c.interests.join('、') : '未设置'}, 共同群聊数: ${c.common_groups}, 共同兴趣数: ${c.common_interests}, 推荐分数: ${c.score}`).join('\n')}

请综合考虑以下因素：
1. 兴趣爱好的相似度和互补性
2. 共同群聊的数量（表示有共同话题）
3. 推荐分数（综合考虑了共同群聊和共同兴趣）

请只返回推荐的2个用户的ID，格式为JSON数组，例如：[123, 456]
如果候选用户少于2个，返回所有候选用户的ID。
只返回JSON数组，不要其他文字说明。`

                console.log(`[AI推荐] 调用DeepSeek API...`)
                
                // 调用DeepSeek API
                const aiResponse = await chatCompletion([
                    {
                        role: 'user',
                        content: prompt
                    }
                ], {
                    temperature: 0.3, // 降低温度，使推荐更稳定
                    max_tokens: 100
                })
                
                console.log(`[AI推荐] DeepSeek API响应:`, JSON.stringify(aiResponse, null, 2))
                
                // 解析AI返回的推荐用户ID
                if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
                    const aiContent = aiResponse.choices[0].message.content.trim()
                    console.log(`[AI推荐] AI返回内容:`, aiContent)
                    
                    // 尝试提取JSON数组
                    let recommendedIds = []
                    try {
                        // 尝试直接解析JSON
                        recommendedIds = JSON.parse(aiContent)
                        console.log(`[AI推荐] 成功解析JSON，推荐用户ID:`, recommendedIds)
                    } catch (e) {
                        // 如果解析失败，尝试从文本中提取数字
                        const idMatches = aiContent.match(/\d+/g)
                        if (idMatches) {
                            recommendedIds = idMatches.map(id => parseInt(id)).slice(0, 2)
                            console.log(`[AI推荐] 从文本中提取用户ID:`, recommendedIds)
                        } else {
                            console.warn(`[AI推荐] 无法从AI响应中提取用户ID`)
                        }
                    }
                    
                    // 如果成功获取到推荐ID，使用AI推荐的结果
                    if (Array.isArray(recommendedIds) && recommendedIds.length > 0) {
                        aiRecommended = topCandidates.filter(c => recommendedIds.includes(c.user_id))
                        // 如果AI推荐的数量不足2个，用评分最高的补充
                        if (aiRecommended.length < 2) {
                            const remaining = topCandidates.filter(c => !recommendedIds.includes(c.user_id))
                            aiRecommended.push(...remaining.slice(0, 2 - aiRecommended.length))
                            console.log(`[AI推荐] AI推荐数量不足，补充评分最高的用户`)
                        }
                        
                        useAIRecommendation = true
                        console.log(`[AI推荐] ✅ AI推荐成功，推荐用户:`, aiRecommended.map(u => `${u.name || u.username}(ID:${u.user_id})`).join(', '))
                    } else {
                        console.warn(`[AI推荐] ⚠️ AI返回的推荐ID无效，回退到评分推荐`)
                    }
                } else {
                    console.warn(`[AI推荐] ⚠️ AI响应格式异常，回退到评分推荐`)
                }
            } catch (aiError) {
                // AI推荐失败，记录错误但不影响功能，回退到评分推荐
                console.warn(`[AI推荐] ❌ AI推荐失败，使用评分推荐:`, aiError.message)
                console.error(`[AI推荐] 错误详情:`, aiError)
            }
        } else {
            if (!chatCompletion) {
                console.log(`[AI推荐] DeepSeek API未配置，使用评分推荐`)
            }
        }
        
        // 9. 如果AI推荐失败或没有候选，使用评分排序的结果
        const recommendations = useAIRecommendation ? aiRecommended.slice(0, 2) : topCandidates.slice(0, 2)
        
        // 在返回结果中添加标记，表示是否使用了AI推荐
        const result = recommendations.map(rec => ({
            ...rec,
            recommended_by_ai: useAIRecommendation
        }))
        
        console.log(`[AI推荐] 最终推荐结果 (${useAIRecommendation ? 'AI推荐' : '评分推荐'}):`, result.map(r => `${r.name || r.username}(ID:${r.user_id}, AI:${r.recommended_by_ai})`).join(', '))
        
        return RespData(res, result)
    } catch (e) {
        console.error('获取好友推荐失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 获取AI推荐原因
 * 为指定的推荐用户生成AI推荐原因
 */
async function GetRecommendationReason(req, res) {
    const current_user_id = req.user.id
    const { user_id } = req.query
    
    if (!user_id) {
        return RespError(res, RespParamErr)
    }
    
    try {
        // 1. 获取当前用户信息
        const currentUserSql = 'SELECT name, username, interests FROM user WHERE id=?'
        const currentUserResult = await Query(currentUserSql, [current_user_id])
        if (currentUserResult.err || !currentUserResult.results || currentUserResult.results.length === 0) {
            return RespError(res, { code: 4001, message: '用户信息获取失败' })
        }
        
        const currentUser = currentUserResult.results[0]
        const currentUserName = currentUser.name || currentUser.username || '用户'
        
        // 解析当前用户的兴趣爱好
        let currentInterestsArray = []
        if (currentUser.interests) {
            const interestsStr = typeof currentUser.interests === 'string' ? currentUser.interests : String(currentUser.interests)
            try {
                const parsed = JSON.parse(interestsStr)
                if (Array.isArray(parsed)) {
                    currentInterestsArray = parsed.filter(t => t && t.trim())
                } else {
                    currentInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                }
            } catch (e) {
                currentInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
            }
        }
        
        // 2. 获取推荐用户信息
        const targetUserSql = 'SELECT id, name, username, interests FROM user WHERE id=?'
        const targetUserResult = await Query(targetUserSql, [user_id])
        if (targetUserResult.err || !targetUserResult.results || targetUserResult.results.length === 0) {
            return RespError(res, { code: 4001, message: '推荐用户不存在' })
        }
        
        const targetUser = targetUserResult.results[0]
        const targetUserName = targetUser.name || targetUser.username || '用户'
        
        // 解析推荐用户的兴趣爱好
        let targetInterestsArray = []
        if (targetUser.interests) {
            const interestsStr = typeof targetUser.interests === 'string' ? targetUser.interests : String(targetUser.interests)
            try {
                const parsed = JSON.parse(interestsStr)
                if (Array.isArray(parsed)) {
                    targetInterestsArray = parsed.filter(t => t && t.trim())
                } else {
                    targetInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
                }
            } catch (e) {
                targetInterestsArray = interestsStr.split(',').map(t => t.trim()).filter(t => t)
            }
        }
        
        // 3. 获取共同群聊信息
        const commonGroupsSql = `SELECT COUNT(DISTINCT gm1.group_id) as common_groups
                                FROM group_members gm1
                                INNER JOIN group_members gm2 ON gm1.group_id = gm2.group_id
                                WHERE gm1.user_id = ? AND gm2.user_id = ?`
        const commonGroupsResult = await Query(commonGroupsSql, [current_user_id, user_id])
        const commonGroups = commonGroupsResult.results?.[0]?.common_groups || 0
        
        // 4. 计算共同兴趣爱好
        const commonInterests = currentInterestsArray.filter(i => targetInterestsArray.includes(i))
        
        // 5. 调用AI生成推荐原因
        if (!chatCompletion) {
            return RespError(res, { code: 5001, message: 'AI服务未配置' })
        }
        
        const prompt = `你是一个好友推荐系统。请为以下推荐生成一段友好的推荐原因（50-100字），说明为什么推荐这个用户。

当前用户信息：
- 姓名：${currentUserName}
- 兴趣爱好：${currentInterestsArray.length > 0 ? currentInterestsArray.join('、') : '未设置'}

推荐用户信息：
- 姓名：${targetUserName}
- 兴趣爱好：${targetInterestsArray.length > 0 ? targetInterestsArray.join('、') : '未设置'}
- 共同兴趣爱好：${commonInterests.length > 0 ? commonInterests.join('、') : '无'}
- 共同群聊数：${commonGroups}

请生成一段自然、友好的推荐原因，突出：
1. 兴趣爱好的相似性或互补性
2. 共同群聊带来的共同话题
3. 为什么你们可能成为好朋友

要求：
- 语言自然、友好、口语化
- 50-100字
- 不要使用"推荐"、"建议"等生硬词汇
- 直接说明推荐理由，就像朋友介绍一样`

        const aiResponse = await chatCompletion([
            {
                role: 'user',
                content: prompt
            }
        ], {
            temperature: 0.7,
            max_tokens: 200
        })
        
        if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
            const reason = aiResponse.choices[0].message.content.trim()
            return RespData(res, { reason })
        } else {
            return RespError(res, { code: 5002, message: 'AI生成推荐原因失败' })
        }
    } catch (e) {
        console.error('获取AI推荐原因失败:', e)
        return RespError(res, RespServerErr)
    }
}

/**
 * 获取黑名单列表
 */
async function GetBlacklist(req, res) {
    const blocker_id = req.user.id
    
    try {
        // 查询所有被拉黑的用户信息
        // 使用子查询获取每个被拉黑用户的最新备注（如果有多个好友分组，取第一个）
        const sql = `SELECT DISTINCT bf.id, bf.blocked_id, bf.created_at,
                            u.id as user_id, u.username, u.name, u.avatar, u.email,
                            (SELECT f.remark 
                             FROM friend f 
                             INNER JOIN friend_group fg ON f.group_id = fg.id 
                             WHERE f.user_id = u.id AND fg.user_id = ? 
                             LIMIT 1) as remark
                     FROM blocked_friend bf
                     INNER JOIN user u ON bf.blocked_id = u.id
                     WHERE bf.blocker_id = ?
                     ORDER BY bf.created_at DESC`
        const { err, results } = await Query(sql, [blocker_id, blocker_id])
        
        if (err) {
            return RespError(res, RespServerErr)
        }
        
        // 处理显示名称：优先使用备注，如果没有备注则使用昵称，最后使用用户名
        // 使用 Map 去重，确保每个 user_id 只出现一次
        const blacklistMap = new Map()
        results.forEach(item => {
            const userId = item.user_id
            // 如果该用户已存在，保留创建时间更早的记录（更早拉黑的）
            if (!blacklistMap.has(userId)) {
                const remark = item.remark && item.remark.trim() && item.remark !== item.username ? item.remark : null
                blacklistMap.set(userId, {
                    id: item.id,
                    user_id: userId,
                    username: item.username,
                    name: item.name,
                    avatar: item.avatar,
                    email: item.email,
                    remark: remark,
                    display_name: remark || item.name || item.username,
                    created_at: item.created_at
                })
            }
        })
        
        // 转换为数组并按创建时间排序
        const blacklist = Array.from(blacklistMap.values()).sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at)
        })
        
        return RespData(res, blacklist)
    } catch (e) {
        console.error('获取黑名单失败:', e)
        return RespError(res, RespServerErr)
    }
}

