module.exports = {
    List,
    MembersList,
    CreateGroupChat,
    SearchGroupChat,
    JoinGroupChat,
    GroupInfo,
    RenameGroup,
    invitedUsersToGroup,
    UpdateGroupAvatar,
    UpdateGroupRemark,
    GetGroupRemark,
    UpdateGroupNickname,
    LeaveGroup,
    TransferGroupOwnership,
    DisbandGroup,
    GetGroupAdmins,
    AddGroupAdmins,
    RemoveGroupAdmin,
    RemoveGroupMember
};

const announcementModule = require('./announcement');
const UpdateAnnouncement = announcementModule.UpdateAnnouncement;
const PublishAnnouncement = announcementModule.PublishAnnouncement;

module.exports = {
    List,
    MembersList,
    CreateGroupChat,
    SearchGroupChat,
    JoinGroupChat,
    GroupInfo,
    RenameGroup,
    invitedUsersToGroup,
    UpdateGroupAvatar,
    UpdateGroupRemark,
    GetGroupRemark,
    UpdateGroupNickname,
    LeaveGroup,
    TransferGroupOwnership,
    DisbandGroup,
    GetGroupAdmins,
    AddGroupAdmins,
    RemoveGroupAdmin,
    RemoveGroupMember,
    UpdateAnnouncement,
    PublishAnnouncement
};

const { RespParamErr, RespServerErr, RespExitFriendErr, RespUpdateErr, RespCreateErr, RespExitGroupErr, RespGroupInsertError } = require('../../model/error');
const { RespError, RespSuccess, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');
const { v4: uuidv4 } = require('uuid');
const messageModule = require('../message/index');
const { generateGroupCode } = require('../../utils/utils');

/**
 * 获取当前用户加入的所有群聊
 */
async function List(req, res) {
    let id = req.user.id
    let groupChatList = []
    // 过滤已解散的群聊（从通讯录中删除）
    let sql = 'SELECT gct.* FROM ((SELECT group_id FROM group_members WHERE user_id=?) AS gmb LEFT JOIN group_chat AS gct ON gmb.group_id=gct.id) WHERE (gct.is_disbanded IS NULL OR gct.is_disbanded = 0)'
    let { err, results } = await Query(sql, [id])
    if (err) return RespError(res, RespServerErr)
    groupChatList = results
    
    // 批量查询所有群聊的成员数量
    if (groupChatList.length > 0) {
        const groupIds = groupChatList.map(g => g.id)
        const placeholders = groupIds.map(() => '?').join(',')
        sql = `SELECT group_id, COUNT(*) AS members_len FROM group_members WHERE group_id IN (${placeholders}) GROUP BY group_id`
        let resp = await Query(sql, groupIds)
        if (!resp.err && resp.results) {
            const memberCountMap = new Map()
            resp.results.forEach(row => {
                memberCountMap.set(row.group_id, row.members_len)
            })
            groupChatList.forEach(group => {
                group.members_len = memberCountMap.get(group.id) || 0
            })
        }
    }
    
    // 批量查询所有群聊的备注
    if (groupChatList.length > 0) {
        const groupIds = groupChatList.map(g => g.id)
        const placeholders = groupIds.map(() => '?').join(',')
        sql = `SELECT group_id, remark FROM group_remark WHERE user_id=? AND group_id IN (${placeholders})`
        let remarkResp = await Query(sql, [id, ...groupIds])
        if (!remarkResp.err && remarkResp.results) {
            const remarkMap = new Map()
            remarkResp.results.forEach(row => {
                remarkMap.set(row.group_id, row.remark)
            })
            groupChatList.forEach(group => {
                group.remark = remarkMap.get(group.id) || null
            })
        } else {
            // 如果没有备注，设置为null
            groupChatList.forEach(group => {
                group.remark = null
            })
        }
    }
    
    return RespData(res, groupChatList)
}

/**
 * 获取群聊中所有群员
 */
async function MembersList(req, res) {
    let { group_id } = req.query
    let sql = 'SELECT username FROM group_members,user WHERE group_id=? AND user_id=user.id'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    let userList = []
    for (const { username } of results) {
        userList.push(username)
    }
    return RespData(res, userList)
}

//创建群聊
async function CreateGroupChat(req, res) {
    let fileName
    if (req.file) {
        fileName = req.file.filename;
    }
    let info = req.body
    const uuid = uuidv4();
    
    let members = JSON.parse(info.members || '[]')
    
    // 验证members数组格式
    if (!Array.isArray(members)) {
        return RespError(res, { code: 4001, message: '成员列表格式错误' })
    }
    
    // 验证：至少需要2个成员（不包括创建者自己）
    if (members.length < 2) {
        return RespError(res, { code: 4002, message: '至少需要选择2个好友才能创建群聊' })
    }
    
    // 去重：确保不会重复添加成员
    const memberMap = new Map()
    members.forEach(member => {
        // 验证成员数据格式
        if (member && member.id && member.id !== req.user.id) {
            memberMap.set(member.id, member)
        }
    })
    
    // 验证：去重后至少需要2个成员
    if (memberMap.size < 2) {
        return RespError(res, { code: 4002, message: '至少需要选择2个好友才能创建群聊' })
    }
    
    // 检查所有成员是否都是双向好友关系
    // 定义 findFriendRelation 函数（与 friend/index.js 中的实现相同）
    const findFriendRelation = async (ownerId, targetId) => {
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
    
    // 检查每个成员是否都是双向好友
    for (const member of memberMap.values()) {
        try {
            // 检查创建者是否把该成员当作好友
            const creatorToMember = await findFriendRelation(req.user.id, member.id)
            // 检查该成员是否把创建者当作好友
            const memberToCreator = await findFriendRelation(member.id, req.user.id)
            
            // 如果不是双向好友，返回错误
            if (!creatorToMember.exists || !memberToCreator.exists) {
                return RespError(res, { code: 4007, message: '创建群聊失败' })
            }
        } catch (error) {
            console.error('检查好友关系失败:', error)
            return RespError(res, { code: 4007, message: '创建群聊失败' })
        }
    }
    
    // 如果名称为空或null，设置为null（表示使用默认名称，每个用户看到的名称会根据自己对成员的备注不同而不同）
    let groupName = info.name
    if (!groupName || groupName.trim() === '') {
        groupName = null // 设置为null，让每个用户根据自己的备注看到不同的名称
    } else {
        groupName = groupName.trim()
    }
    
    // 生成唯一的群id（8-10位随机数字）
    let groupCode = generateGroupCode()
    let maxAttempts = 10
    let attempts = 0
    while (attempts < maxAttempts) {
        // 检查group_code是否已存在
        const checkSql = 'SELECT id FROM group_chat WHERE group_code = ?'
        const checkResult = await Query(checkSql, [groupCode])
        if (checkResult.err) {
            console.error('检查group_code失败:', checkResult.err)
            break
        }
        if (!checkResult.results || checkResult.results.length === 0) {
            // group_code不存在，可以使用
            break
        }
        // group_code已存在，重新生成
        groupCode = generateGroupCode()
        attempts++
    }
    if (attempts >= maxAttempts) {
        return RespError(res, { code: 5001, message: '生成群id失败，请重试' })
    }
    
    let group_chat = {
        name: groupName, // 如果为空则使用null，表示使用默认名称
        creator_id: req.user.id,
        avatar: "",
        announcement: info.announcement || "",
        room: uuid,
        group_code: groupCode
    }

    if (fileName) {
        group_chat.avatar = `/uploads/group/${fileName}`
    }

    //创建群聊
    let sql = 'INSERT INTO group_chat SET ?'
    let { err, results } = await Query(sql, group_chat)
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        // 初始化消息统计表（不发送默认消息）
        sql = 'INSERT INTO message_statistics SET ?'
        await Query(sql, { room: uuid, total: 0 })
        
        // 插入自己（创建者）
        const creatorInfo = {
            group_id: results.insertId,
            user_id: req.user.id,
            nickname: req.user.name || req.user.username
        }
        sql = 'INSERT INTO group_members SET ?'
        await Query(sql, creatorInfo)
        
        // 获取所有群成员ID（包括创建者和被邀请的成员）
        const allMemberIds = [req.user.id, ...Array.from(memberMap.keys())]
        
        // 插入选中的成员（只插入members数组中的成员，不包括创建者）
        const insertedMemberIds = []
        for (const member of memberMap.values()) {
            // 先检查成员是否已经存在（避免重复插入）
            const checkSql = 'SELECT id FROM group_members WHERE group_id=? AND user_id=?'
            const checkResult = await Query(checkSql, [results.insertId, member.id])
            if (checkResult.err) {
                console.error('检查群成员失败:', checkResult.err)
                continue // 跳过这个成员，继续处理下一个
            }
            if (checkResult.results && checkResult.results.length > 0) {
                // 成员已存在，跳过
                insertedMemberIds.push(member.id)
                continue
            }
            
            let memberInfo = {
                group_id: results.insertId,
                user_id: member.id,
                nickname: member.name || member.username || '用户'
            }
            sql = 'INSERT INTO group_members SET ?'
            const insertMemberResult = await Query(sql, memberInfo)
            // 检查插入是否成功（忽略重复插入的错误，因为可能已经存在）
            if (insertMemberResult.err && insertMemberResult.err.code !== 'ER_DUP_ENTRY') {
                console.error('插入群成员失败:', insertMemberResult.err, 'member:', member.id)
                // 继续处理其他成员，不中断整个流程
            } else {
                // 插入成功
                insertedMemberIds.push(member.id)
            }
        }
        
        // 如果没有任何成员被成功插入，返回错误（但至少应该有创建者自己）
        if (insertedMemberIds.length === 0 && memberMap.size > 0) {
            console.error('所有成员插入失败')
            // 不返回错误，因为至少创建者已经插入成功
        }
        
        // 创建系统通知消息（使用特殊格式，在显示时根据每个用户对成员的备注动态生成内容）
        // 格式：{"type":"invite","creator_id":123,"invited_member_ids":[456,789]}
        const systemContentData = {
            type: 'invite',
            creator_id: req.user.id,
            invited_member_ids: Array.from(memberMap.keys())
        }
        const systemContent = JSON.stringify(systemContentData)
        
        // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
        const systemMsg = {
            sender_id: req.user.id,
            receiver_id: results.insertId, // 群聊消息的receiver_id是群ID
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: uuid,
            file_size: 0,
            status: 0 // 默认未读
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果创建者在线，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, req.user.id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [uuid])
        
        let options = {
            room: uuid,
            group_id: results.insertId
        }
        return RespData(res, options)
    }

    return RespError(res, RespCreateErr)
}

/**
 * 查询群聊
 */
async function SearchGroupChat(req, res) {
    const { name } = req.query
    let sql = 'SELECT * FROM group_chat WHERE name LIKE ?'
    let { err, results } = await Query(sql, [`%${name}%`])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    let searchList = []
    if (results.length != 0) {
        let { id } = req.user
        sql = 'SELECT id,user_id FROM group_members WHERE group_id=?'
        for (const item of results) {
            let status = false
            let res = await Query(sql, [item.id])
            let err2 = res.err, results2 = res.results
            for (const { user_id } of results2) {
                if (user_id == id) {
                    status = true
                    break
                }
            }
            searchList.push({ name: item.name, number: results2.length, status: status, group_id: item.id })
        }
    }
    RespData(res, searchList)
}

async function JoinGroupChat(req, res) {
    let group_id = req.query.group_id
    let { id, name } = req.user
    let sql = "SELECT id FROM group_members WHERE group_id=? AND user_id=?"
    let { err, results } = await Query(sql, [group_id, id])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.length != 0) {
        return RespError(res, RespExitGroupErr)
    }
    
    // 检查群聊是否存在且未解散
    sql = 'SELECT room, is_disbanded FROM group_chat WHERE id=?'
    const groupCheck = await Query(sql, [group_id])
    if (groupCheck.err) return RespError(res, RespServerErr)
    if (!groupCheck.results || groupCheck.results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    if (groupCheck.results[0].is_disbanded === 1) {
        return RespError(res, { code: 4002, message: '群聊已解散' })
    }
    const room = groupCheck.results[0].room
    
    let info = {
        group_id: group_id,
        user_id: id,
        nickname: name
    }
    //插入成员
    sql = 'INSERT INTO group_members SET ?'
    let resp = await Query(sql, info)
    err = resp.err
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    
    // 发送系统通知：xxx通过搜索加入了群聊
    // 使用特殊格式，在显示时根据每个用户对加入者的备注动态生成内容
    // 格式：{"type":"join_by_search","user_id":123}
    const systemContentData = {
        type: 'join_by_search',
        user_id: id
    }
    const systemContent = JSON.stringify(systemContentData)
    
    // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
    const systemMsg = {
        sender_id: id,
        receiver_id: group_id, // 群聊消息的receiver_id是群ID
        type: 'group',
        media_type: 'system',
        content: systemContent,
        room: room,
        file_size: 0,
        status: 0
    }
    
    sql = 'INSERT INTO message SET ?'
    const systemInsertResult = await Query(sql, systemMsg)
    if (systemInsertResult.err) {
        console.error('插入系统通知消息失败:', systemInsertResult.err)
        // 不影响加入群聊的结果，继续返回成功
    } else {
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket实时发送系统通知给所有群成员
        const messageModule = require('../message/index')
        const rooms = messageModule.rooms
        if (rooms[room]) {
            const systemNotification = {
                type: 'system',
                sender_id: id,
                receiver_id: group_id,
                content: systemContent,
                room: room,
                media_type: 'system',
                created_at: new Date().toISOString(),
                id: systemInsertResult.results.insertId
            }
            // 发送给所有群成员（包括刚加入的自己）
            Object.keys(rooms[room]).forEach(userId => {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            })
        }
    }
    
    let options = {
        room: room,
        group_id: group_id
    }
    return RespData(res, options)
}

/**
 * 群聊信息
 */
async function GroupInfo(req, res) {
    let group_id = req.query.group_id
    const user_id = req.user.id
    let info = {}
    let sql = 'SELECT * FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    let { id, creator_id, avatar, announcement, room, name, created_at, is_disbanded, group_code } = results[0]
    info = {
        id, name, creator_id, avatar, announcement, room, created_at, is_disbanded: is_disbanded || 0, group_code: group_code || null, members: []
    }
    // 查询群成员（包含用户信息和当前用户对成员的好友备注）
    // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
    // 使用子查询获取好友备注，避免JOIN导致重复
    sql = `SELECT gm.user_id, gm.nickname as group_nickname, gm.created_at, 
                  u.avatar, u.name, u.username,
                  (SELECT f.remark 
                   FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = gm.user_id AND fg.user_id = ?
                   LIMIT 1) as friend_remark
           FROM group_members gm 
           LEFT JOIN user u ON gm.user_id = u.id 
           WHERE gm.group_id=? 
           ORDER BY gm.created_at ASC`
    let resp = await Query(sql, [user_id, group_id])
    if (resp.err) return RespError(res, RespServerErr)
    info.members = resp.results
    
    // 查询用户对群聊的备注
    sql = 'SELECT remark FROM group_remark WHERE user_id=? AND group_id=?'
    let remarkResp = await Query(sql, [user_id, group_id])
    if (!remarkResp.err && remarkResp.results.length > 0) {
        info.user_remark = remarkResp.results[0].remark
    } else {
        info.user_remark = null
    }
    
    // 查询用户在群内的昵称
    const currentMember = info.members.find(m => m.user_id === user_id)
    info.user_nickname = currentMember ? currentMember.group_nickname : null
    
    return RespData(res, info)
}

/**
 * 重命名群聊
 */
async function RenameGroup(req, res) {
    const { name, group_id } = req.body
    // name 可以为 null 或空字符串，表示使用默认名称（所有成员昵称用、分隔）
    // 如果name是空字符串，转换为null
    const finalName = (name && name.trim() !== '') ? name.trim() : null
    let sql = 'UPDATE group_chat SET name=? WHERE id=?'
    let { err, results } = await Query(sql, [finalName, group_id])
    // 查询数据失败
    if (err) {
        console.error('更新群聊名称失败:', err)
        return RespError(res, RespServerErr)
    }
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 邀请用户加入群聊
 */
async function invitedUsersToGroup(req, res) {
    const { group_id, userList } = req.body
    const user_id = req.user.id
    
    // 获取群聊房间号
    let sql = 'SELECT room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    const room = results[0].room
    
    // 定义 findFriendRelation 函数（与创建群聊中的实现相同）
    const findFriendRelation = async (ownerId, targetId) => {
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
    
    // 检查所有要添加的成员是否都是双向好友关系
    for (const user of userList) {
        try {
            // 检查当前用户是否把该成员当作好友
            const currentToMember = await findFriendRelation(user_id, user.id)
            // 检查该成员是否把当前用户当作好友
            const memberToCurrent = await findFriendRelation(user.id, user_id)
            
            // 如果不是双向好友，返回错误
            if (!currentToMember.exists || !memberToCurrent.exists) {
                return RespError(res, { code: 4007, message: '添加成员失败' })
            }
        } catch (error) {
            console.error('检查好友关系失败:', error)
            return RespError(res, { code: 4007, message: '添加成员失败' })
        }
    }
    
    sql = 'SELECT id FROM group_members WHERE group_id=? AND user_id=?'
    let inviteList = []
    for (const user of userList) {
        let resp = await Query(sql, [group_id, user.id])
        if (resp.err) {
            console.error('查询群成员失败:', resp.err)
            continue // 跳过这个用户，继续处理下一个
        }
        if (resp.results.length == 0) {
            let memberInfo = {
                group_id: group_id,
                user_id: user.id,
                nickname: user.name
            }
            sql = 'INSERT INTO group_members SET ?'
            const insertResult = await Query(sql, memberInfo)
            // 检查插入是否成功（忽略重复插入的错误）
            if (insertResult.err && insertResult.err.code !== 'ER_DUP_ENTRY') {
                console.error('插入群成员失败:', insertResult.err)
                continue // 跳过这个用户，继续处理下一个
            }
            inviteList.push(user)
        }
    }
    if (inviteList.length == 0) {
        return RespError(res, RespGroupInsertError)
    }
    
    // 发送系统通知：xxx邀请了yyy进入群聊
    // 为每个被邀请的成员分别发送系统通知
    const messageModule = require('../message/index')
    const rooms = messageModule.rooms
    
    for (const invitedUser of inviteList) {
        // 创建系统通知消息（使用特殊格式，在显示时根据每个用户对邀请者和被邀请者的备注动态生成内容）
        // 格式：{"type":"invite_member","inviter_id":123,"invited_user_id":456}
        const systemContentData = {
            type: 'invite_member',
            inviter_id: user_id,
            invited_user_id: invitedUser.id
        }
        const systemContent = JSON.stringify(systemContentData)
        
        // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id, // 群聊消息的receiver_id是群ID
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0 // 默认未读
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是邀请者，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        if (rooms && rooms[room]) {
            // 构造系统通知消息对象（包含原始JSON内容，前端会根据当前用户对邀请者和被邀请者的备注动态生成显示内容）
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent, // JSON格式的内容
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
    }
    
    return RespData(res, inviteList)
}

/**
 * 更新群聊头像
 */
async function UpdateGroupAvatar(req, res) {
    const group_id = req.body.group_id
    let fileName = null
    if (req.file) {
        fileName = `/uploads/group/${req.file.filename}`
    }
    
    if (!fileName) {
        return RespError(res, { code: 4001, message: '请上传头像文件' })
    }
    
    let sql = 'UPDATE group_chat SET avatar=? WHERE id=?'
    let { err, results } = await Query(sql, [fileName, group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespData(res, { avatar: fileName })
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 更新群聊备注（个人备注）
 */
async function UpdateGroupRemark(req, res) {
    const { group_id, remark } = req.body
    const user_id = req.user.id
    
    let sql = 'INSERT INTO group_remark (user_id, group_id, remark) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE remark=?, updated_at=CURRENT_TIMESTAMP'
    let { err, results } = await Query(sql, [user_id, group_id, remark || null, remark || null])
    if (err) return RespError(res, RespServerErr)
    return RespSuccess(res)
}

/**
 * 获取群聊备注（个人备注）
 */
async function GetGroupRemark(req, res) {
    const { group_id } = req.query
    const user_id = req.user.id
    
    let sql = 'SELECT remark FROM group_remark WHERE user_id=? AND group_id=?'
    let { err, results } = await Query(sql, [user_id, group_id])
    if (err) return RespError(res, RespServerErr)
    const remark = results.length > 0 ? results[0].remark : null
    return RespData(res, { remark })
}

/**
 * 更新群昵称
 */
async function UpdateGroupNickname(req, res) {
    const { group_id, nickname } = req.body
    const user_id = req.user.id
    
    // 如果昵称为空，查询用户的原始昵称作为默认值
    let finalNickname = nickname
    if (!finalNickname || finalNickname.trim() === '') {
        let sql = 'SELECT name FROM user WHERE id=?'
        let { err, results } = await Query(sql, [user_id])
        if (err) return RespError(res, RespServerErr)
        if (results.length === 0) {
            return RespError(res, { code: 4001, message: '用户不存在' })
        }
        // 使用用户的原始昵称，如果也没有则使用用户名
        finalNickname = results[0].name
        if (!finalNickname) {
            sql = 'SELECT username FROM user WHERE id=?'
            let resp = await Query(sql, [user_id])
            if (resp.err) return RespError(res, RespServerErr)
            finalNickname = resp.results[0]?.username || '用户'
        }
    }
    
    let sql = 'UPDATE group_members SET nickname=? WHERE group_id=? AND user_id=?'
    let { err, results } = await Query(sql, [finalNickname, group_id, user_id])
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 退出群聊
 */
async function LeaveGroup(req, res) {
    const { group_id } = req.body
    const user_id = req.user.id
    
    // 检查是否是群主
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 群主不能退出（需要先转让或解散）
    if (results[0].creator_id === user_id) {
        return RespError(res, { code: 4002, message: '群主不能退出群聊' })
    }
    
    const room = results[0].room
    
    // 在删除成员记录之前，先获取退出者的群聊昵称信息
    sql = `SELECT gm.nickname as group_nickname, u.name, u.username
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ? AND gm.user_id = ?
           LIMIT 1`
    const leaverInfoResp = await Query(sql, [group_id, user_id])
    let leaverGroupNickname = null
    let leaverName = null
    let leaverUsername = null
    if (leaverInfoResp.results && leaverInfoResp.results.length > 0) {
        leaverGroupNickname = leaverInfoResp.results[0].group_nickname
        leaverName = leaverInfoResp.results[0].name
        leaverUsername = leaverInfoResp.results[0].username
    }
    
    // 删除群成员记录
    sql = 'DELETE FROM group_members WHERE group_id=? AND user_id=?'
    let resp = await Query(sql, [group_id, user_id])
    if (resp.err) return RespError(res, RespServerErr)
    
    if (resp.results.affectedRows === 1) {
        // 发送系统通知：xxx退出了群聊
        // 创建系统通知消息（使用特殊格式，在显示时根据每个用户对退出者的备注动态生成内容）
        // 格式：{"type":"leave_group","user_id":123,"group_nickname":"xxx","name":"yyy","username":"zzz"}
        const systemContentData = {
            type: 'leave_group',
            user_id: user_id,
            group_nickname: leaverGroupNickname,
            name: leaverName,
            username: leaverUsername
        }
        const systemContent = JSON.stringify(systemContentData)
        
        // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id, // 群聊消息的receiver_id是群ID
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0 // 默认未读
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是退出者，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        const messageModule = require('../message/index')
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            // 构造系统通知消息对象（包含原始JSON内容，前端会根据当前用户对退出者的备注动态生成显示内容）
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent, // JSON格式的内容
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
        
        return RespSuccess(res)
    }
    return RespError(res, { code: 4003, message: '退出群聊失败' })
}

/**
 * 转让群主
 */
async function TransferGroupOwnership(req, res) {
    const { group_id, new_creator_id } = req.body
    const user_id = req.user.id
    
    if (!group_id || !new_creator_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 检查是否是群主
    if (results[0].creator_id !== user_id) {
        return RespError(res, { code: 4003, message: '你不是群主，无法进行操作' })
    }
    
    // 检查新群主是否是群成员
    sql = 'SELECT user_id FROM group_members WHERE group_id=? AND user_id=?'
    const memberCheck = await Query(sql, [group_id, new_creator_id])
    if (memberCheck.err) return RespError(res, RespServerErr)
    if (!memberCheck.results || memberCheck.results.length === 0) {
        return RespError(res, { code: 4004, message: '新群主必须是群成员' })
    }
    
    // 不能转让给自己
    if (new_creator_id === user_id) {
        return RespError(res, { code: 4005, message: '不能转让给自己' })
    }
    
    // 更新群主
    sql = 'UPDATE group_chat SET creator_id=? WHERE id=?'
    const updateResult = await Query(sql, [new_creator_id, group_id])
    if (updateResult.err) return RespError(res, RespServerErr)
    
    if (updateResult.results.affectedRows === 1) {
        // 发送系统通知：xxx已成为新的群主
        // 使用特殊格式，在显示时根据每个用户对新群主的备注动态生成内容
        const room = results[0].room
        
        // 创建系统通知消息（使用特殊格式，在显示时根据每个用户对新群主的备注动态生成内容）
        // 格式：{"type":"transfer_ownership","old_creator_id":123,"new_creator_id":456}
        const systemContentData = {
            type: 'transfer_ownership',
            old_creator_id: user_id,
            new_creator_id: new_creator_id
        }
        const systemContent = JSON.stringify(systemContentData)
        
        // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id, // 群聊消息的receiver_id是群ID
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0 // 默认未读
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是原群主，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            // 获取新群主的基本信息（用于WebSocket消息）
            sql = `SELECT u.name, u.username, gm.nickname as group_nickname
                   FROM user u
                   LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ?
                   WHERE u.id = ?`
            const newOwnerResp = await Query(sql, [group_id, new_creator_id])
            let newOwnerName = '用户'
            if (newOwnerResp.results && newOwnerResp.results.length > 0) {
                const info = newOwnerResp.results[0]
                newOwnerName = info.group_nickname || info.name || info.username || '用户'
            }
            
            // 构造系统通知消息对象（包含原始JSON内容，前端会根据当前用户对新群主的备注动态生成显示内容）
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent, // JSON格式的内容
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
        
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 获取群管理员列表
 */
async function GetGroupAdmins(req, res) {
    const { group_id } = req.query
    const user_id = req.user.id
    
    if (!group_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 查询管理员列表（包含用户信息和群聊昵称、好友备注）
    sql = `SELECT ga.user_id, ga.created_at,
                  gm.nickname as group_nickname,
                  u.name, u.username, u.avatar,
                  (SELECT f.remark 
                   FROM friend f 
                   INNER JOIN friend_group fg ON f.group_id = fg.id 
                   WHERE f.user_id = ga.user_id AND fg.user_id = ?
                   LIMIT 1) as friend_remark
           FROM group_admin ga
           INNER JOIN group_members gm ON gm.group_id = ? AND gm.user_id = ga.user_id
           INNER JOIN user u ON u.id = ga.user_id
           WHERE ga.group_id = ?
           ORDER BY ga.created_at ASC`
    const adminResp = await Query(sql, [user_id, group_id, group_id])
    if (adminResp.err) return RespError(res, RespServerErr)
    
    return RespData(res, adminResp.results || [])
}

/**
 * 添加群管理员
 */
async function AddGroupAdmins(req, res) {
    const { group_id, user_ids } = req.body
    const user_id = req.user.id
    
    if (!group_id || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 检查是否是群主
    if (results[0].creator_id !== user_id) {
        return RespError(res, { code: 4003, message: '你不是群主，无法进行操作' })
    }
    
    const room = results[0].room
    
    // 检查每个用户是否是群成员
    const validUserIds = []
    for (const targetUserId of user_ids) {
        // 不能添加自己为管理员
        if (targetUserId === user_id) {
            continue
        }
        
        // 检查是否是群成员
        sql = 'SELECT user_id FROM group_members WHERE group_id=? AND user_id=?'
        const memberCheck = await Query(sql, [group_id, targetUserId])
        if (memberCheck.err) return RespError(res, RespServerErr)
        if (!memberCheck.results || memberCheck.results.length === 0) {
            continue // 跳过非群成员
        }
        
        // 检查是否已经是管理员
        sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
        const adminCheck = await Query(sql, [group_id, targetUserId])
        if (adminCheck.err) return RespError(res, RespServerErr)
        if (adminCheck.results && adminCheck.results.length > 0) {
            continue // 跳过已经是管理员的用户
        }
        
        validUserIds.push(targetUserId)
    }
    
    if (validUserIds.length === 0) {
        return RespError(res, { code: 4004, message: '没有可添加的管理员' })
    }
    
    // 批量插入管理员记录
    for (const targetUserId of validUserIds) {
        sql = 'INSERT INTO group_admin (group_id, user_id) VALUES (?, ?)'
        const insertResult = await Query(sql, [group_id, targetUserId])
        if (insertResult.err) return RespError(res, RespServerErr)
        
        // 为每个被添加的管理员发送系统通知
        // 格式：{"type":"add_admin","operator_id":123,"admin_user_id":456}
        const systemContentData = {
            type: 'add_admin',
            operator_id: user_id,
            admin_user_id: targetUserId
        }
        const systemContent = JSON.stringify(systemContentData)
        
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id,
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是操作者，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent,
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
    }
    
    return RespData(res, { added_count: validUserIds.length })
}

/**
 * 移除群管理员
 */
async function RemoveGroupAdmin(req, res) {
    const { group_id, admin_user_id } = req.body
    const user_id = req.user.id
    
    if (!group_id || !admin_user_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 检查是否是群主
    if (results[0].creator_id !== user_id) {
        return RespError(res, { code: 4003, message: '你不是群主，无法进行操作' })
    }
    
    // 检查是否是管理员
    sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
    const adminCheck = await Query(sql, [group_id, admin_user_id])
    if (adminCheck.err) return RespError(res, RespServerErr)
    if (!adminCheck.results || adminCheck.results.length === 0) {
        return RespError(res, { code: 4004, message: '该用户不是管理员' })
    }
    
    const room = results[0].room
    
    // 删除管理员记录
    sql = 'DELETE FROM group_admin WHERE group_id=? AND user_id=?'
    const deleteResult = await Query(sql, [group_id, admin_user_id])
    if (deleteResult.err) return RespError(res, RespServerErr)
    
    if (deleteResult.results.affectedRows === 1) {
        // 发送系统通知：已将xxx从群管理员中移除
        // 格式：{"type":"remove_admin","operator_id":123,"admin_user_id":456}
        const systemContentData = {
            type: 'remove_admin',
            operator_id: user_id,
            admin_user_id: admin_user_id
        }
        const systemContent = JSON.stringify(systemContentData)
        
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id,
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是操作者，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent,
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
        
        return RespSuccess(res)
    }
    
    return RespError(res, RespUpdateErr)
}

/**
 * 移除群成员（踢出群聊）
 * 只有群主和管理员可以移除成员
 */
async function RemoveGroupMember(req, res) {
    const { group_id, user_id } = req.body
    const operator_id = req.user.id
    
    if (!group_id || !user_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    const room = results[0].room
    const creator_id = results[0].creator_id
    
    // 检查操作者是否是群主或管理员
    let isOperatorAdmin = false
    if (operator_id !== creator_id) {
        sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
        const adminCheck = await Query(sql, [group_id, operator_id])
        if (adminCheck.err) return RespError(res, RespServerErr)
        if (!adminCheck.results || adminCheck.results.length === 0) {
            return RespError(res, { code: 4003, message: '你不是群主或管理员，无法进行操作' })
        }
        isOperatorAdmin = true
    }
    
    // 不能移除群主
    if (user_id === creator_id) {
        return RespError(res, { code: 4004, message: '不能移除群主' })
    }
    
    // 如果是管理员（不是群主），不能移除其他管理员
    if (isOperatorAdmin) {
        sql = 'SELECT id FROM group_admin WHERE group_id=? AND user_id=?'
        const targetAdminCheck = await Query(sql, [group_id, user_id])
        if (targetAdminCheck.err) return RespError(res, RespServerErr)
        if (targetAdminCheck.results && targetAdminCheck.results.length > 0) {
            return RespError(res, { code: 4007, message: '管理员不能移除其他管理员' })
        }
    }
    
    // 检查被移除的用户是否是群成员
    sql = 'SELECT id FROM group_members WHERE group_id=? AND user_id=?'
    const memberCheck = await Query(sql, [group_id, user_id])
    if (memberCheck.err) return RespError(res, RespServerErr)
    if (!memberCheck.results || memberCheck.results.length === 0) {
        return RespError(res, { code: 4005, message: '该用户不是群成员' })
    }
    
    // 获取操作者的显示信息（用于系统通知）
    sql = `SELECT gm.nickname as group_nickname, u.name, u.username
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ? AND gm.user_id = ?
           LIMIT 1`
    const operatorInfoResp = await Query(sql, [group_id, operator_id])
    let operatorGroupNickname = null
    let operatorName = null
    let operatorUsername = null
    if (operatorInfoResp.results && operatorInfoResp.results.length > 0) {
        operatorGroupNickname = operatorInfoResp.results[0].group_nickname
        operatorName = operatorInfoResp.results[0].name
        operatorUsername = operatorInfoResp.results[0].username
    }
    
    // 获取被移除成员的显示信息（用于系统通知）
    sql = `SELECT gm.nickname as group_nickname, u.name, u.username
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ? AND gm.user_id = ?
           LIMIT 1`
    const removedMemberInfoResp = await Query(sql, [group_id, user_id])
    let removedMemberGroupNickname = null
    let removedMemberName = null
    let removedMemberUsername = null
    if (removedMemberInfoResp.results && removedMemberInfoResp.results.length > 0) {
        removedMemberGroupNickname = removedMemberInfoResp.results[0].group_nickname
        removedMemberName = removedMemberInfoResp.results[0].name
        removedMemberUsername = removedMemberInfoResp.results[0].username
    }
    
    // 删除群成员记录
    sql = 'DELETE FROM group_members WHERE group_id=? AND user_id=?'
    let resp = await Query(sql, [group_id, user_id])
    if (resp.err) return RespError(res, RespServerErr)
    
    if (resp.results.affectedRows === 1) {
        // 如果被移除的成员是管理员，同时删除管理员记录
        sql = 'DELETE FROM group_admin WHERE group_id=? AND user_id=?'
        await Query(sql, [group_id, user_id])
        
        // 发送系统通知：xxx将yyy移出了群聊
        // 格式：{"type":"remove_member","operator_id":123,"removed_user_id":456,"operator_group_nickname":"xxx","operator_name":"yyy","operator_username":"zzz","removed_group_nickname":"aaa","removed_name":"bbb","removed_username":"ccc"}
        const systemContentData = {
            type: 'remove_member',
            operator_id: operator_id,
            removed_user_id: user_id,
            operator_group_nickname: operatorGroupNickname,
            operator_name: operatorName,
            operator_username: operatorUsername,
            removed_group_nickname: removedMemberGroupNickname,
            removed_name: removedMemberName,
            removed_username: removedMemberUsername
        }
        const systemContent = JSON.stringify(systemContentData)
        
        const systemMsg = {
            sender_id: operator_id,
            receiver_id: group_id,
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是操作者，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, operator_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员（包括被移除的成员，如果还在线）
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: operator_id,
                receiver_id: group_id,
                content: systemContent,
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
        
        return RespData(res, { removed_user_id: user_id })
    }
    
    return RespError(res, { code: 4006, message: '移除成员失败' })
}

/**
 * 解散群聊
 */
async function DisbandGroup(req, res) {
    const { group_id } = req.body
    const user_id = req.user.id
    
    if (!group_id) {
        return RespError(res, { code: 4002, message: '参数有误' })
    }
    
    // 检查群聊是否存在
    let sql = 'SELECT creator_id, room FROM group_chat WHERE id=?'
    let { err, results } = await Query(sql, [group_id])
    if (err) return RespError(res, RespServerErr)
    if (results.length === 0) {
        return RespError(res, { code: 4001, message: '群聊不存在' })
    }
    
    // 检查是否是群主
    if (results[0].creator_id !== user_id) {
        return RespError(res, { code: 4003, message: '你不是群主，无法进行操作' })
    }
    
    // 检查群聊是否已经解散
    sql = 'SELECT is_disbanded FROM group_chat WHERE id=?'
    const disbandCheck = await Query(sql, [group_id])
    if (disbandCheck.err) return RespError(res, RespServerErr)
    if (disbandCheck.results && disbandCheck.results.length > 0 && disbandCheck.results[0].is_disbanded === 1) {
        return RespError(res, { code: 4004, message: '群聊已解散' })
    }
    
    const room = results[0].room
    
    // 获取群主的基本信息（用于系统通知）
    sql = `SELECT gm.nickname as group_nickname, u.name, u.username
           FROM group_members gm
           LEFT JOIN user u ON u.id = gm.user_id
           WHERE gm.group_id = ? AND gm.user_id = ?
           LIMIT 1`
    const creatorInfoResp = await Query(sql, [group_id, user_id])
    let creatorGroupNickname = null
    let creatorName = null
    let creatorUsername = null
    if (creatorInfoResp.results && creatorInfoResp.results.length > 0) {
        creatorGroupNickname = creatorInfoResp.results[0].group_nickname
        creatorName = creatorInfoResp.results[0].name
        creatorUsername = creatorInfoResp.results[0].username
    }
    
    // 更新群聊状态为已解散
    sql = 'UPDATE group_chat SET is_disbanded=1 WHERE id=?'
    const updateResult = await Query(sql, [group_id])
    if (updateResult.err) return RespError(res, RespServerErr)
    
    if (updateResult.results.affectedRows === 1) {
        // 发送系统通知：xxx已解散该群聊
        // 创建系统通知消息（使用特殊格式，在显示时根据每个用户对群主的备注动态生成内容）
        // 格式：{"type":"disband_group","creator_id":123,"group_nickname":"xxx","name":"yyy","username":"zzz"}
        const systemContentData = {
            type: 'disband_group',
            creator_id: user_id,
            group_nickname: creatorGroupNickname,
            name: creatorName,
            username: creatorUsername
        }
        const systemContent = JSON.stringify(systemContentData)
        
        // 插入系统通知消息（所有成员共享一条消息，但显示时内容不同）
        const systemMsg = {
            sender_id: user_id,
            receiver_id: group_id, // 群聊消息的receiver_id是群ID
            type: 'group',
            media_type: 'system',
            content: systemContent,
            room: room,
            file_size: 0,
            status: 0 // 默认未读
        }
        sql = 'INSERT INTO message SET ?'
        const insertMsgResult = await Query(sql, systemMsg)
        
        // 如果当前用户是群主，自动标记为已读
        if (insertMsgResult.results && insertMsgResult.results.insertId) {
            const messageId = insertMsgResult.results.insertId
            sql = `INSERT IGNORE INTO message_read (message_id, user_id) VALUES (?, ?)`
            await Query(sql, [messageId, user_id])
        }
        
        // 更新消息统计
        sql = `UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`
        await Query(sql, [room])
        
        // 通过WebSocket广播系统通知给所有群成员
        const rooms = messageModule.rooms
        if (rooms && rooms[room]) {
            // 构造系统通知消息对象（包含原始JSON内容，前端会根据当前用户对群主的备注动态生成显示内容）
            const systemNotification = {
                id: insertMsgResult.results.insertId,
                sender_id: user_id,
                receiver_id: group_id,
                content: systemContent, // JSON格式的内容
                room: room,
                type: 'system',
                media_type: 'system',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0
            }
            
            // 广播给房间内所有在线用户
            for (const userId in rooms[room]) {
                if (rooms[room][userId] && rooms[room][userId].readyState === 1) {
                    rooms[room][userId].send(JSON.stringify(systemNotification))
                }
            }
        }
        
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

