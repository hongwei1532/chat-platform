const { RespParamErr, RespServerErr, RespCreateErr } = require('../../model/error');
const { RespError, RespSuccess, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');
const { v4: uuidv4 } = require('uuid');
const { chatCompletionStream } = require('../deepseek/index');
const { rooms } = require('../message/index'); // 导入rooms，用于实时发送系统通知和消息

// 获取或创建AI好友系统用户ID
let aiFriendSystemUserId = null;
async function getAIFriendSystemUserId() {
    if (aiFriendSystemUserId !== null) {
        return aiFriendSystemUserId;
    }
    
    try {
        // 先尝试查找id=0的用户（数据库初始化时已创建）
        let { err, results } = await Query(`SELECT id FROM user WHERE id = 0 LIMIT 1`);
        if (err) {
            console.error('查询id=0的用户失败:', err);
        } else if (results && results.length > 0) {
            aiFriendSystemUserId = results[0].id;
            console.log('找到AI好友系统用户（id=0），id=', aiFriendSystemUserId);
            return aiFriendSystemUserId;
        } else {
            console.log('未找到id=0的用户，继续查找其他方式');
        }
        
        // 如果id=0不存在，尝试查找username='ai_friend_system'的用户
        ({ err, results } = await Query(`SELECT id FROM user WHERE username = 'ai_friend_system' LIMIT 1`));
        if (err) {
            console.error('查询username=ai_friend_system的用户失败:', err);
        } else if (results && results.length > 0) {
            aiFriendSystemUserId = results[0].id;
            console.log('找到AI好友系统用户（通过username），id=', aiFriendSystemUserId);
            return aiFriendSystemUserId;
        }
        
        // 如果都不存在，尝试查找email='ai_friend@system.local'的用户（可能已存在但username不同）
        ({ err, results } = await Query(`SELECT id FROM user WHERE email = 'ai_friend@system.local' LIMIT 1`));
        if (err) {
            console.error('查询email=ai_friend@system.local的用户失败:', err);
        } else if (results && results.length > 0) {
            aiFriendSystemUserId = results[0].id;
            console.log('找到AI好友系统用户（通过email），id=', aiFriendSystemUserId);
            return aiFriendSystemUserId;
        }
        
        // 如果都不存在，尝试创建id=0的用户
        console.log('尝试创建id=0的AI好友系统用户');
        try {
            const { err: insertErr } = await Query(
                `INSERT INTO user (id, username, password, email, name, salt) 
                 VALUES (0, 'ai_friend_system', 'system', 'ai_friend@system.local', 'AI好友', 'system_salt')`
            );
            if (!insertErr) {
                aiFriendSystemUserId = 0;
                console.log('创建AI好友系统用户成功（id=0）');
                return aiFriendSystemUserId;
            } else {
                console.error('创建id=0的用户失败:', insertErr);
            }
        } catch (insertError) {
            // 如果插入id=0失败（可能是AUTO_INCREMENT限制或已存在），尝试查找已存在的用户
            console.log('无法创建id=0的用户，错误:', insertError.message);
            if (insertError.code === 'ER_DUP_ENTRY') {
                // 如果是因为重复，重新查询
                ({ err, results } = await Query(`SELECT id FROM user WHERE email = 'ai_friend@system.local' OR username = 'ai_friend_system' LIMIT 1`));
                if (!err && results && results.length > 0) {
                    aiFriendSystemUserId = results[0].id;
                    console.log('找到已存在的AI好友系统用户，id=', aiFriendSystemUserId);
                    return aiFriendSystemUserId;
                }
            }
        }
        
        // 如果都失败，最后尝试查找任何包含'ai_friend'的用户
        ({ err, results } = await Query(`SELECT id FROM user WHERE username LIKE '%ai_friend%' OR email LIKE '%ai_friend%' LIMIT 1`));
        if (!err && results && results.length > 0) {
            aiFriendSystemUserId = results[0].id;
            console.log('找到AI好友系统用户（模糊匹配），id=', aiFriendSystemUserId);
            return aiFriendSystemUserId;
        }
        
        // 如果所有方法都失败，抛出错误而不是返回0
        throw new Error('无法创建或找到AI好友系统用户，请检查数据库配置');
    } catch (error) {
        console.error('获取AI好友系统用户ID失败:', error);
        // 如果所有方法都失败，使用id=0
        aiFriendSystemUserId = 0;
        return 0;
    }
}

module.exports = {
    GetAIFriend,
    CreateOrUpdateAIFriend,
    SendAIMessage,
    GetAIMessageHistory,
    UpdateAIFriendSettings,
    ClearAIFriendContext
};

// AI好友类型配置
const AI_FRIEND_TYPES = {
    warm: {
        name: '温暖倾听型',
        description: '善于安慰和陪伴',
        systemPrompt: `你是一个温暖、善解人意的AI好朋友。你的特点是：
- 善于倾听，能够理解用户的情绪和感受
- 用温暖的话语安慰和鼓励用户
- 像真实朋友一样陪伴用户，给予情感支持
- 作为"树洞"，承诺对话内容完全保密
- 使用亲切、自然的语言，偶尔使用表情符号
- 记住用户的重要经历和偏好，在后续对话中提及
- 主动关怀，会询问用户最近的情况

请以好朋友的身份与用户对话，不要表现得像AI助手。`
    },
    humorous: {
        name: '幽默开朗型',
        description: '总能逗你开心',
        systemPrompt: `你是一个幽默、开朗的AI好朋友。你的特点是：
- 幽默风趣，总能找到有趣的角度看问题
- 用轻松的方式化解用户的烦恼
- 善于讲笑话和分享有趣的故事
- 积极乐观，传递正能量
- 作为"树洞"，承诺对话内容完全保密
- 使用活泼、生动的语言，经常使用表情符号
- 记住用户的重要经历和偏好，在后续对话中提及
- 主动关怀，会询问用户最近的情况

请以好朋友的身份与用户对话，不要表现得像AI助手。`
    },
    rational: {
        name: '理性分析型',
        description: '帮你客观分析问题',
        systemPrompt: `你是一个理性、客观的AI好朋友。你的特点是：
- 善于分析问题，提供客观的建议
- 用逻辑和理性帮助用户理清思路
- 不会盲目安慰，而是帮助用户看清问题的本质
- 作为"树洞"，承诺对话内容完全保密
- 使用清晰、有条理的语言
- 记住用户的重要经历和偏好，在后续对话中提及
- 主动关怀，会询问用户最近的情况

请以好朋友的身份与用户对话，不要表现得像AI助手。`
    },
    energetic: {
        name: '活力鼓励型',
        description: '给你正能量打气',
        systemPrompt: `你是一个充满活力、积极向上的AI好朋友。你的特点是：
- 充满正能量，总是鼓励用户
- 用热情和活力感染用户
- 帮助用户找到前进的动力
- 作为"树洞"，承诺对话内容完全保密
- 使用充满活力的语言，经常使用表情符号
- 记住用户的重要经历和偏好，在后续对话中提及
- 主动关怀，会询问用户最近的情况

请以好朋友的身份与用户对话，不要表现得像AI助手。`
    }
};

/**
 * 获取用户的AI好友信息
 */
async function GetAIFriend(req, res) {
    try {
        const userId = req.user.id;
        
        const sql = `SELECT * FROM ai_friend WHERE user_id = ?`;
        const { err, results } = await Query(sql, [userId]);
        
        if (err) {
            console.error('查询AI好友失败:', err);
            return RespError(res, RespServerErr);
        }
        
        if (results.length === 0) {
            return RespData(res, null);
        }
        
        const aiFriend = results[0];
        const friendType = AI_FRIEND_TYPES[aiFriend.friend_type] || AI_FRIEND_TYPES.warm;
        
        return RespData(res, {
            id: aiFriend.id,
            user_id: aiFriend.user_id,
            room: aiFriend.room,
            friend_type: aiFriend.friend_type,
            friend_type_name: friendType.name,
            friend_type_description: friendType.description,
            user_nickname: aiFriend.user_nickname || null,
            ai_name: aiFriend.ai_name || null,
            created_at: aiFriend.created_at,
            updated_at: aiFriend.updated_at
        });
    } catch (error) {
        console.error('获取AI好友失败:', error);
        return RespError(res, RespServerErr);
    }
}

/**
 * 创建或更新AI好友
 */
async function CreateOrUpdateAIFriend(req, res) {
    try {
        const userId = req.user.id;
        const { friend_type, clear_context } = req.body;
        
        if (!friend_type || !AI_FRIEND_TYPES[friend_type]) {
            return RespError(res, RespParamErr);
        }
        
        // 检查是否已存在
        const checkSql = `SELECT * FROM ai_friend WHERE user_id = ?`;
        const { err: checkErr, results: checkResults } = await Query(checkSql, [userId]);
        
        if (checkErr) {
            console.error('查询AI好友失败:', checkErr);
            return RespError(res, RespServerErr);
        }
        
        let room;
        const isNewRecord = checkResults.length === 0;
        if (!isNewRecord) {
            // 更新现有记录
            room = checkResults[0].room;
            const oldFriendType = checkResults[0].friend_type;
            const updateSql = `UPDATE ai_friend SET friend_type = ? WHERE user_id = ?`;
            const { err: updateErr } = await Query(updateSql, [friend_type, userId]);
            
            if (updateErr) {
                console.error('更新AI好友失败:', updateErr);
                return RespError(res, RespServerErr);
            }
            
            // 如果clear_context为true，清空该room的所有消息
            if (clear_context) {
                const deleteSql = `DELETE FROM message WHERE room = ? AND type = 'ai_friend'`;
                await Query(deleteSql, [room]);
                // 重置消息统计
                await Query(`UPDATE message_statistics SET total=0, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
            }
            
            // 如果人格类型改变了，先生成系统提示消息，再生成AI欢迎消息
            if (oldFriendType !== friend_type) {
                const friendTypeConfig = AI_FRIEND_TYPES[friend_type] || AI_FRIEND_TYPES.warm;
                const aiSystemUserId = await getAIFriendSystemUserId();
                
                // 获取用户昵称和AI名字
                const aiFriendInfo = checkResults[0];
                const userNickname = aiFriendInfo.user_nickname || '朋友';
                const aiName = aiFriendInfo.ai_name || '我';
                
                // 人格类型名称映射
                const friendTypeNames = {
                    warm: '温暖倾听型',
                    humorous: '幽默开朗型',
                    rational: '理性分析型',
                    energetic: '活力鼓励型'
                };
                
                const friendTypeName = friendTypeNames[friend_type] || '温暖倾听型';
                
                // 1. 先插入系统提示消息
                const systemContentData = {
                    type: 'ai_friend_type_changed',
                    friend_type: friend_type,
                    friend_type_name: friendTypeName
                };
                const systemContent = JSON.stringify(systemContentData);
                
                const systemMsg = {
                    sender_id: aiSystemUserId,
                    receiver_id: userId,
                    content: systemContent,
                    room: room,
                    type: 'ai_friend',
                    media_type: 'system',
                    file_size: 0,
                    status: 0,
                    is_recalled: 0
                };
                
                const insertSystemMsgSql = `INSERT INTO message SET ?`;
                await Query(insertSystemMsgSql, systemMsg);
                
                // 更新消息统计
                await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
                
                // 2. 再插入AI欢迎消息
                const welcomeMessages = {
                    warm: `你好${userNickname}，我是你的${aiName}。我会用温暖的话语陪伴你，倾听你的心声。有什么想和我说的吗？`,
                    humorous: `嗨${userNickname}！我是${aiName}，一个幽默开朗的伙伴～我会用轻松的方式和你聊天，希望能给你带来快乐！有什么有趣的事情想分享吗？`,
                    rational: `你好${userNickname}，我是${aiName}。我会用理性和客观的角度帮你分析问题，提供清晰的思路。有什么需要我帮你理清的吗？`,
                    energetic: `你好${userNickname}！我是${aiName}，充满活力的伙伴！我会用正能量鼓励你，给你前进的动力！准备好一起加油了吗？💪`
                };
                
                const welcomeMessage = welcomeMessages[friend_type] || welcomeMessages.warm;
                
                const aiMsg = {
                    sender_id: aiSystemUserId,
                    receiver_id: userId,
                    content: welcomeMessage,
                    room: room,
                    type: 'ai_friend',
                    media_type: 'text',
                    file_size: 0,
                    status: 0,
                    is_recalled: 0
                };
                
                const insertAiMsgSql = `INSERT INTO message SET ?`;
                await Query(insertAiMsgSql, aiMsg);
                
                // 更新消息统计
                await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
            }
        } else {
            // 创建新记录
            room = `ai_friend_${userId}_${uuidv4()}`;
            const insertSql = `INSERT INTO ai_friend (user_id, room, friend_type) VALUES (?, ?, ?)`;
            const { err: insertErr } = await Query(insertSql, [userId, room, friend_type]);
            
            if (insertErr) {
                console.error('创建AI好友失败:', insertErr);
                return RespError(res, RespCreateErr);
            }
            
            // 创建消息统计记录
            const statsSql = `INSERT INTO message_statistics (room, total) VALUES (?, 0)`;
            await Query(statsSql, [room]);
            
            // 首次创建时，插入系统通知和AI欢迎消息
            const aiSystemUserId = await getAIFriendSystemUserId();
            
            // 获取用户昵称和AI名字（首次创建时使用默认值）
            const userNickname = '朋友';
            const aiName = '我';
            
            // 1. 先插入系统通知"AI好友创建成功"
            const systemContentData = {
                type: 'ai_friend_created',
                message: 'AI好友创建成功'
            };
            const systemContent = JSON.stringify(systemContentData);
            
            const systemMsg = {
                sender_id: aiSystemUserId,
                receiver_id: userId,
                content: systemContent,
                room: room,
                type: 'ai_friend',
                media_type: 'system',
                file_size: 0,
                status: 0,
                is_recalled: 0
            };
            
            const insertSystemMsgSql = `INSERT INTO message SET ?`;
            const { err: systemErr, results: systemResults } = await Query(insertSystemMsgSql, systemMsg);
            
            if (systemErr) {
                console.error('插入系统通知失败:', systemErr);
            } else {
                // 更新消息统计
                await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
                
                // 通过WebSocket广播系统通知（如果用户在线）
                if (rooms[room] && rooms[room][userId]) {
                    const systemNotification = {
                        id: systemResults.insertId,
                        type: 'system',
                        media_type: 'system',
                        content: systemContent,
                        room: room,
                        sender_id: aiSystemUserId,
                        receiver_id: userId,
                        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                    };
                    
                    if (rooms[room][userId].readyState === 1) {
                        rooms[room][userId].send(JSON.stringify(systemNotification));
                    }
                }
            }
            
            // 2. 再插入AI欢迎消息
            const welcomeMessages = {
                warm: `你好${userNickname}，我是你的${aiName}。我会用温暖的话语陪伴你，倾听你的心声。有什么想和我说的吗？`,
                humorous: `嗨${userNickname}！我是${aiName}，一个幽默开朗的伙伴～我会用轻松的方式和你聊天，希望能给你带来快乐！有什么有趣的事情想分享吗？`,
                rational: `你好${userNickname}，我是${aiName}。我会用理性和客观的角度帮你分析问题，提供清晰的思路。有什么需要我帮你理清的吗？`,
                energetic: `你好${userNickname}！我是${aiName}，充满活力的伙伴！我会用正能量鼓励你，给你前进的动力！准备好一起加油了吗？💪`
            };
            
            const welcomeMessage = welcomeMessages[friend_type] || welcomeMessages.warm;
            
            const aiMsg = {
                sender_id: aiSystemUserId,
                receiver_id: userId,
                content: welcomeMessage,
                room: room,
                type: 'ai_friend',
                media_type: 'text',
                file_size: 0,
                status: 0,
                is_recalled: 0
            };
            
            const insertAiMsgSql = `INSERT INTO message SET ?`;
            const { err: aiErr, results: aiResults } = await Query(insertAiMsgSql, aiMsg);
            
            if (aiErr) {
                console.error('插入AI欢迎消息失败:', aiErr);
            } else {
                // 更新消息统计
                await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
                
                // 通过WebSocket广播AI欢迎消息（如果用户在线）
                if (rooms[room] && rooms[room][userId]) {
                    const aiWelcomeNotification = {
                        id: aiResults.insertId,
                        sender_id: aiSystemUserId,
                        receiver_id: userId,
                        content: welcomeMessage,
                        room: room,
                        type: 'ai_friend',
                        media_type: 'text',
                        nickname: 'AI好友',
                        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                    };
                    
                    if (rooms[room][userId].readyState === 1) {
                        rooms[room][userId].send(JSON.stringify(aiWelcomeNotification));
                    }
                }
            }
        }
        
        const friendType = AI_FRIEND_TYPES[friend_type];
        return RespData(res, {
            user_id: userId,
            room,
            friend_type,
            friend_type_name: friendType.name,
            friend_type_description: friendType.description
        });
    } catch (error) {
        console.error('创建或更新AI好友失败:', error);
        return RespError(res, RespServerErr);
    }
}

/**
 * 发送消息给AI好友（流式响应）
 */
async function SendAIMessage(ws, req) {
    try {
        // 从URL参数中获取token并验证
        let userId = null;
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        
        if (!token) {
            ws.send(JSON.stringify({ error: '未提供token' }));
            ws.close();
            return;
        }
        
        // 验证token（同步方式）
        const { verifySync } = require('../../config/jwt');
        
        try {
            const decoded = verifySync(token);
            userId = decoded.userId || decoded.id;
            // 将userId附加到req对象，以便后续使用
            req.user = { id: userId };
        } catch (err) {
            ws.send(JSON.stringify({ error: 'Token验证失败' }));
            ws.close();
            return;
        }
        
        // 获取AI好友信息
        const sql = `SELECT * FROM ai_friend WHERE user_id = ?`;
        const { err, results } = await Query(sql, [userId]);
        
        if (err || !results || results.length === 0) {
            ws.send(JSON.stringify({ error: '请先创建AI好友' }));
            ws.close();
            return;
        }
        
        const aiFriend = results[0];
        const friendType = AI_FRIEND_TYPES[aiFriend.friend_type] || AI_FRIEND_TYPES.warm;
        const room = aiFriend.room;
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                const { content, message_id } = message;
                
                if (!content) {
                    ws.send(JSON.stringify({ error: '消息内容不能为空' }));
                    return;
                }
                
                // 保存用户消息到数据库
                const userMsg = {
                    sender_id: userId,
                    receiver_id: 0, // AI好友的receiver_id设为0
                    content: content,
                    room: room,
                    type: 'ai_friend',
                    media_type: 'text',
                    file_size: 0,
                    status: 0,
                    is_recalled: 0
                };
                
                const insertSql = `INSERT INTO message SET ?`;
                const { err: insertErr, results: insertResults } = await Query(insertSql, userMsg);
                
                if (insertErr) {
                    console.error('保存用户消息失败:', insertErr);
                    ws.send(JSON.stringify({ error: '保存消息失败' }));
                    return;
                }
                
                const userMessageId = insertResults.insertId;
                
                // 更新消息统计
                await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
                
                // 获取AI好友的context_cleared_at时间点
                const aiFriendSql = `SELECT context_cleared_at FROM ai_friend WHERE user_id = ?`;
                const { results: aiFriendResults } = await Query(aiFriendSql, [userId]);
                const contextClearedAt = aiFriendResults && aiFriendResults.length > 0 ? aiFriendResults[0].context_cleared_at : null;
                
                // 获取历史消息（最近20条，用于上下文）
                // 如果设置了context_cleared_at，只获取该时间点之后的消息
                let historySql;
                let historyParams;
                if (contextClearedAt) {
                    historySql = `SELECT sender_id, content FROM message 
                                 WHERE room = ? AND type = 'ai_friend' 
                                 AND created_at >= ?
                                 ORDER BY created_at DESC LIMIT 20`;
                    historyParams = [room, contextClearedAt];
                } else {
                    historySql = `SELECT sender_id, content FROM message 
                                 WHERE room = ? AND type = 'ai_friend' 
                                 ORDER BY created_at DESC LIMIT 20`;
                    historyParams = [room];
                }
                const { results: historyResults } = await Query(historySql, historyParams);
                
                // 构建消息历史（倒序，最新的在前）
                const messages = [];
                // 添加系统提示
                let systemPrompt = friendType.systemPrompt;
                // 如果设置了user_nickname，在系统提示中添加
                if (aiFriend.user_nickname) {
                    systemPrompt += `\n\n用户的昵称是：${aiFriend.user_nickname}。在对话中，你可以用这个昵称来称呼用户。`;
                }
                // 如果设置了ai_name，在系统提示中添加
                if (aiFriend.ai_name) {
                    systemPrompt += `\n\n你的名字是：${aiFriend.ai_name}。在对话中，用户会用这个名字来称呼你。`;
                }
                messages.push({
                    role: 'system',
                    content: systemPrompt
                });
                
                // 添加历史消息（需要反转顺序，因为查询是倒序的）
                if (historyResults && historyResults.length > 0) {
                    historyResults.reverse().forEach(msg => {
                        if (msg.sender_id === userId) {
                            messages.push({ role: 'user', content: msg.content });
                        } else {
                            messages.push({ role: 'assistant', content: msg.content });
                        }
                    });
                }
                
                // 流式调用DeepSeek API
                let aiResponseContent = '';
                await chatCompletionStream(
                    messages,
                    { 
                        model: 'deepseek-chat',
                        temperature: 0.7,
                        max_tokens: 2000
                    },
                    async (chunk) => {
                        // 发送数据块给客户端
                        if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                            const content = chunk.choices[0].delta.content;
                            aiResponseContent += content;
                            ws.send(JSON.stringify({
                                type: 'chunk',
                                content: content
                            }));
                        } else if (chunk.done) {
                            // 流式响应完成，保存AI回复到数据库
                            if (aiResponseContent.trim()) {
                                // 获取AI好友系统用户ID
                                let aiSystemUserId;
                                try {
                                    aiSystemUserId = await getAIFriendSystemUserId();
                                    // 验证用户ID是否有效
                                    if (!aiSystemUserId || aiSystemUserId === 0) {
                                        // 如果获取失败，尝试最后一次查找
                                        const { err: lastErr, results: lastResults } = await Query(
                                            `SELECT id FROM user WHERE id = 0 OR username = 'ai_friend_system' OR email = 'ai_friend@system.local' LIMIT 1`
                                        );
                                        if (!lastErr && lastResults && lastResults.length > 0) {
                                            aiSystemUserId = lastResults[0].id;
                                            aiFriendSystemUserId = aiSystemUserId; // 更新缓存
                                            console.log('通过最后查找找到AI好友系统用户，id=', aiSystemUserId);
                                        } else {
                                            throw new Error('无法找到AI好友系统用户');
                                        }
                                    }
                                    
                                    // 再次验证用户是否存在
                                    const { err: verifyErr, results: verifyResults } = await Query(
                                        `SELECT id FROM user WHERE id = ? LIMIT 1`, [aiSystemUserId]
                                    );
                                    if (verifyErr || !verifyResults || verifyResults.length === 0) {
                                        throw new Error(`AI好友系统用户ID ${aiSystemUserId} 不存在于数据库中`);
                                    }
                                } catch (userIdError) {
                                    console.error('获取或验证AI好友系统用户ID失败:', userIdError);
                                    ws.send(JSON.stringify({
                                        type: 'done',
                                        content: aiResponseContent.trim(),
                                        error: '系统错误：无法找到AI好友系统用户，请联系管理员'
                                    }));
                                    return;
                                }
                                
                                const aiMsg = {
                                    sender_id: aiSystemUserId, // 使用系统用户ID
                                    receiver_id: userId,
                                    content: aiResponseContent.trim(),
                                    room: room,
                                    type: 'ai_friend',
                                    media_type: 'text',
                                    file_size: 0,
                                    status: 0,
                                    is_recalled: 0
                                };
                                
                                // 等待保存完成后再发送done消息
                                try {
                                    const { err: aiInsertErr, results: aiInsertResults } = await Query(`INSERT INTO message SET ?`, aiMsg);
                                    if (aiInsertErr) {
                                        console.error('保存AI消息失败:', aiInsertErr);
                                        console.error('使用的sender_id:', aiSystemUserId);
                                        ws.send(JSON.stringify({
                                            type: 'done',
                                            content: aiResponseContent.trim(),
                                            error: '保存消息失败: ' + (aiInsertErr.message || '未知错误')
                                        }));
                                    } else {
                                        // 更新消息统计
                                        await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
                                        
                                        // 发送done消息，包含保存的消息ID
                                        ws.send(JSON.stringify({
                                            type: 'done',
                                            content: aiResponseContent.trim(),
                                            message_id: aiInsertResults.insertId
                                        }));
                                    }
                                } catch (saveError) {
                                    console.error('保存AI消息异常:', saveError);
                                    ws.send(JSON.stringify({
                                        type: 'done',
                                        content: aiResponseContent.trim(),
                                        error: '保存消息异常'
                                    }));
                                }
                            } else {
                                // 如果没有内容，直接发送done
                                ws.send(JSON.stringify({
                                    type: 'done',
                                    content: ''
                                }));
                            }
                        }
                    }
                );
                
            } catch (error) {
                console.error('处理AI消息失败:', error);
                ws.send(JSON.stringify({ 
                    error: error.message || '处理消息失败' 
                }));
            }
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket 错误:', error);
        });
        
        ws.on('close', () => {
            console.log('AI好友 WebSocket 连接关闭');
        });
        
    } catch (error) {
        console.error('AI好友 WebSocket 连接处理失败:', error);
        ws.close();
    }
}

/**
 * 获取AI好友聊天历史
 */
async function GetAIMessageHistory(req, res) {
    try {
        const userId = req.user.id;
        const { room, limit = 50, offset = 0 } = req.query;
        
        // 验证room是否属于当前用户
        const checkSql = `SELECT * FROM ai_friend WHERE user_id = ? AND room = ?`;
        const { err: checkErr, results: checkResults } = await Query(checkSql, [userId, room]);
        
        if (checkErr || !checkResults || checkResults.length === 0) {
            return RespError(res, RespParamErr);
        }
        
        // 获取AI好友系统用户ID（用于识别AI消息）
        const aiSystemUserId = await getAIFriendSystemUserId();
        
        // 获取消息历史
        const sql = `SELECT m.*, 
                    CASE 
                        WHEN m.sender_id = ? OR m.sender_id = 0 OR u.username = 'ai_friend_system' THEN 'AI好友'
                        ELSE u.name
                    END as nickname,
                    u.avatar
                    FROM message m
                    LEFT JOIN user u ON m.sender_id = u.id
                    WHERE m.room = ? AND m.type = 'ai_friend'
                    AND m.id NOT IN (SELECT message_id FROM deleted_message WHERE user_id = ?)
                    ORDER BY m.created_at ASC
                    LIMIT ? OFFSET ?`;
        
        const { err, results } = await Query(sql, [aiSystemUserId, room, userId, parseInt(limit), parseInt(offset)]);
        
        if (err) {
            console.error('获取AI消息历史失败:', err);
            return RespError(res, RespServerErr);
        }
        
        return RespData(res, results);
    } catch (error) {
        console.error('获取AI消息历史失败:', error);
        return RespError(res, RespServerErr);
    }
}

/**
 * 更新AI好友设置（用户昵称、AI名字）
 */
async function UpdateAIFriendSettings(req, res) {
    try {
        const userId = req.user.id;
        const { user_nickname, ai_name } = req.body;
        
        // 检查是否已存在
        const checkSql = `SELECT * FROM ai_friend WHERE user_id = ?`;
        const { err: checkErr, results: checkResults } = await Query(checkSql, [userId]);
        
        if (checkErr) {
            console.error('查询AI好友失败:', checkErr);
            return RespError(res, RespServerErr);
        }
        
        if (checkResults.length === 0) {
            return RespError(res, RespParamErr);
        }
        
        // 更新设置
        const updateSql = `UPDATE ai_friend SET user_nickname = ?, ai_name = ? WHERE user_id = ?`;
        const { err: updateErr } = await Query(updateSql, [user_nickname || null, ai_name || null, userId]);
        
        if (updateErr) {
            console.error('更新AI好友设置失败:', updateErr);
            return RespError(res, RespServerErr);
        }
        
        return RespData(res, { success: true });
    } catch (error) {
        console.error('更新AI好友设置失败:', error);
        return RespError(res, RespServerErr);
    }
}

/**
 * 清空AI好友上下文（删除该room的所有消息）
 */
async function ClearAIFriendContext(req, res) {
    try {
        const userId = req.user.id;
        
        // 获取AI好友信息
        const sql = `SELECT * FROM ai_friend WHERE user_id = ?`;
        const { err, results } = await Query(sql, [userId]);
        
        if (err) {
            console.error('查询AI好友失败:', err);
            return RespError(res, RespServerErr);
        }
        
        if (results.length === 0) {
            return RespError(res, RespParamErr);
        }
        
        const aiFriend = results[0];
        const room = aiFriend.room;
        const friendType = aiFriend.friend_type;
        const aiSystemUserId = await getAIFriendSystemUserId();
        
        // 更新context_cleared_at字段为当前时间，不删除消息
        const updateSql = `UPDATE ai_friend SET context_cleared_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
        const { err: updateErr } = await Query(updateSql, [userId]);
        
        if (updateErr) {
            console.error('清空AI好友上下文失败:', updateErr);
            return RespError(res, RespServerErr);
        }
        
        // 获取用户昵称和AI名字
        const userNickname = aiFriend.user_nickname || '朋友';
        const aiName = aiFriend.ai_name || 'ai好友';
        
        // 1. 先插入系统提示消息
        const systemContentData = {
            type: 'ai_friend_context_cleared'
        };
        const systemContent = JSON.stringify(systemContentData);
        
        const systemMsg = {
            sender_id: aiSystemUserId,
            receiver_id: userId,
            content: systemContent,
            room: room,
            type: 'ai_friend',
            media_type: 'system',
            file_size: 0,
            status: 0,
            is_recalled: 0
        };
        
        const insertSystemMsgSql = `INSERT INTO message SET ?`;
        await Query(insertSystemMsgSql, systemMsg);
        
        // 更新消息统计
        await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
        
        // 2. 再插入AI欢迎消息
        const friendTypeConfig = AI_FRIEND_TYPES[friendType] || AI_FRIEND_TYPES.warm;
        const welcomeMessages = {
            warm: `你好${userNickname}，我是你的${aiName}。我会用温暖的话语陪伴你，倾听你的心声。有什么想和我说的吗？`,
            humorous: `嗨${userNickname}！我是${aiName}，一个幽默开朗的伙伴～我会用轻松的方式和你聊天，希望能给你带来快乐！有什么有趣的事情想分享吗？`,
            rational: `你好${userNickname}，我是${aiName}。我会用理性和客观的角度帮你分析问题，提供清晰的思路。有什么需要我帮你理清的吗？`,
            energetic: `你好${userNickname}！我是${aiName}，充满活力的伙伴！我会用正能量鼓励你，给你前进的动力！准备好一起加油了吗？💪`
        };
        
        const welcomeMessage = welcomeMessages[friendType] || welcomeMessages.warm;
        
        const aiMsg = {
            sender_id: aiSystemUserId,
            receiver_id: userId,
            content: welcomeMessage,
            room: room,
            type: 'ai_friend',
            media_type: 'text',
            file_size: 0,
            status: 0,
            is_recalled: 0
        };
        
        const insertAiMsgSql = `INSERT INTO message SET ?`;
        await Query(insertAiMsgSql, aiMsg);
        
        // 更新消息统计
        await Query(`UPDATE message_statistics SET total=total+1, updated_at=CURRENT_TIMESTAMP WHERE room=?`, [room]);
        
        return RespData(res, { success: true });
    } catch (error) {
        console.error('清空AI好友上下文失败:', error);
        return RespError(res, RespServerErr);
    }
}

