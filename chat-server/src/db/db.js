// 数据库连接和表初始化
const mysql = require('mysql2')
const fs = require('fs')
require('dotenv').config()

/**
 * 初始化参数
 */
let host = process.env.DB_HOST || 'localhost'
let port = process.env.DB_PORT || 3306
let user = process.env.DB_USER || 'root'
let password = process.env.DB_PASSWORD || ''
let database = process.env.DB_NAME || 'chat'

/**
 * 如果配置文件存在,则读取配置文件,不存在则使用环境变量
 */
if (fs.existsSync("config.json")) {
    var res = JSON.parse(fs.readFileSync(`config.json`))
    host = res.host || host
    port = res.port || port
    user = res.user || user
    password = res.password || password
    database = res.database || database
}

// 1. 先创建数据库连接（不指定数据库）用于创建数据库
const adminDb = mysql.createPool({
    host,
    port,
    user,
    password,
    multipleStatements: true,
    charset: 'utf8mb4'
})

// 2. 创建数据库（如果不存在）
adminDb.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, (err) => {
    if (err) {
        console.log('创建数据库失败:', err.message)
    } else {
        console.log(`数据库 ${database} 准备就绪`)
    }
})

// 3. 建立与 MySQL 数据库的连接关系（指定数据库）
const db = mysql.createPool({
    host, // 数据库的 IP 地址
    port, //端口
    user, // 登录数据库的账号
    password, // 登录数据库的密码
    database, // 指定要操作哪个数据库
    multipleStatements: true,
    charset: 'utf8mb4'
})

console.log(`连接数据库: ${database}@${host}:${port}`)

//创建user表
function initUserTable() {
    let sql = `CREATE TABLE IF NOT EXISTS user (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NULL,
        salt VARCHAR(20) NOT NULL,
        signature LONGTEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建user表失败:', error);
        console.log('user表创建成功')
        // 检查并修改email字段（如果存在但未设置为唯一且非空）
        db.query(`SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'email'`, (err, res) => {
            if (err) {
                console.log('检查email字段失败:', err.message)
            } else if (res.length === 0) {
                // email字段不存在，添加它（唯一且非空）
                db.query(`ALTER TABLE user ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE, ADD INDEX idx_email (email)`, (alterErr) => {
                    if (alterErr) {
                        console.log('添加email字段失败:', alterErr.message)
                    } else {
                        console.log('email字段添加成功（唯一且非空）')
                    }
                })
            } else {
                // email字段存在，检查是否需要修改为唯一且非空
                const column = res[0]
                if (column.IS_NULLABLE === 'YES' || column.COLUMN_KEY !== 'UNI') {
                    // 先检查是否有NULL值或重复值
                    db.query(`SELECT COUNT(*) as nullCount FROM user WHERE email IS NULL`, (nullErr, nullRes) => {
                        if (!nullErr && nullRes[0].nullCount > 0) {
                            console.log('警告：存在NULL邮箱，无法设置为非空。请先更新所有用户的邮箱。')
                        } else {
                            db.query(`ALTER TABLE user MODIFY COLUMN email VARCHAR(255) NOT NULL UNIQUE`, (alterErr) => {
                                if (alterErr) {
                                    console.log('修改email字段失败:', alterErr.message)
                                } else {
                                    console.log('email字段已修改为唯一且非空')
                                }
                            })
                        }
                    })
                }
            }
        })
        // 检查并添加interests字段（如果不存在）
        db.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'interests'`, (err, res) => {
            if (err) {
                console.log('检查interests字段失败:', err.message)
            } else if (res.length === 0) {
                // interests字段不存在，添加它
                db.query(`ALTER TABLE user ADD COLUMN interests TEXT NULL COMMENT '兴趣爱好（逗号分隔或JSON数组）'`, (alterErr) => {
                    if (alterErr) {
                        console.log('添加interests字段失败:', alterErr.message)
                    } else {
                        console.log('interests字段添加成功')
                    }
                })
            }
        })
        // 创建AI好友系统用户（id=0）
        // 先检查是否存在id=0的用户
        db.query(`SELECT id FROM user WHERE id = 0`, (checkErr, checkRes) => {
            if (checkErr) {
                console.log('检查AI好友系统用户失败:', checkErr.message);
            } else if (!checkRes || checkRes.length === 0) {
                // 不存在，尝试创建系统用户（id=0）
                // 先尝试直接插入id=0
                db.query(`INSERT INTO user (id, username, password, email, name, salt) 
                         VALUES (0, 'ai_friend_system', 'system', 'ai_friend@system.local', 'AI好友', 'system_salt')`, (aiUserErr) => {
                    if (aiUserErr) {
                        // 如果插入失败（可能是AUTO_INCREMENT限制或已存在），尝试查找
                        if (aiUserErr.code === 'ER_DUP_ENTRY') {
                            // 如果是因为重复，说明已存在，重新查询
                            db.query(`SELECT id FROM user WHERE id = 0 OR email = 'ai_friend@system.local' LIMIT 1`, (findErr, findRes) => {
                                if (!findErr && findRes && findRes.length > 0) {
                                    console.log('AI好友系统用户已存在，id=', findRes[0].id);
                                } else {
                                    console.log('AI好友系统用户创建失败（重复键），但查询也失败');
                                }
                            });
                        } else {
                            // 其他错误，尝试创建普通用户
                            console.log('无法创建id=0的用户，尝试创建普通系统用户:', aiUserErr.message);
                            db.query(`INSERT IGNORE INTO user (username, password, email, name, salt) 
                                     VALUES ('ai_friend_system', 'system', 'ai_friend@system.local', 'AI好友', 'system_salt')`, (aiUserErr2) => {
                                if (aiUserErr2 && aiUserErr2.code !== 'ER_DUP_ENTRY') {
                                    console.log('创建AI好友系统用户失败:', aiUserErr2.message);
                                } else {
                                    // 查询创建的用户的ID
                                    db.query(`SELECT id FROM user WHERE email = 'ai_friend@system.local' LIMIT 1`, (queryErr, queryRes) => {
                                        if (!queryErr && queryRes && queryRes.length > 0) {
                                            console.log('AI好友系统用户已创建（使用自动ID），id=', queryRes[0].id);
                                        } else {
                                            console.log('AI好友系统用户可能已存在');
                                        }
                                    });
                                }
                            });
                        }
                    } else {
                        console.log('AI好友系统用户已就绪（id=0）');
                    }
                });
            } else {
                console.log('AI好友系统用户已存在，id=', checkRes[0].id);
            }
        });
        initGroupTable()
        initMessageTable()
    });
}

//创建好友分组表
function initGroupTable() {
    const sql = `CREATE TABLE IF NOT EXISTS friend_group (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT(11) NOT NULL,
        username VARCHAR(255) NOT NULL,
        name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建friend_group表失败:', error);
        console.log('friend_group表创建成功')
        initFriendTable()
        initGroupChatTable()
    });
}

//创建好友表
function initFriendTable() {
    const sql = `CREATE TABLE IF NOT EXISTS friend (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT(11) NOT NULL,
        username VARCHAR(50) NOT NULL,
        online_status ENUM('online', 'offline') DEFAULT 'offline',
        remark VARCHAR(50),
        group_id INT(11),
        room VARCHAR(255),
        unread_msg_count INT(11) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_group_id (group_id),
        FOREIGN KEY (group_id) REFERENCES friend_group(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建friend表失败:', error);
        console.log('friend表创建成功')
        initFriendRequestTable()
    });
}

// 创建好友申请表
function initFriendRequestTable() {
    const sql = `CREATE TABLE IF NOT EXISTS friend_request (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sender_id INT(11) NOT NULL,
        receiver_id INT(11) NOT NULL,
        greeting VARCHAR(255),
        remark VARCHAR(255),
        status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
        handled_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sender_id (sender_id),
        INDEX idx_receiver_id (receiver_id),
        CONSTRAINT fk_friend_request_sender FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE,
        CONSTRAINT fk_friend_request_receiver FOREIGN KEY (receiver_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建friend_request表失败:', error);
        console.log('friend_request表创建成功')
        initBlockedFriendTable()
    });
}

// 创建拉黑好友表
function initBlockedFriendTable() {
    const sql = `CREATE TABLE IF NOT EXISTS blocked_friend (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        blocker_id INT(11) NOT NULL COMMENT '拉黑者ID',
        blocked_id INT(11) NOT NULL COMMENT '被拉黑者ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_blocker_blocked (blocker_id, blocked_id),
        INDEX idx_blocker_id (blocker_id),
        INDEX idx_blocked_id (blocked_id),
        FOREIGN KEY (blocker_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建blocked_friend表失败:', error);
        console.log('blocked_friend表创建成功')
    });
}

// 为已存在的群聊生成group_code
function generateGroupCodesForExistingGroups() {
    const { generateGroupCode } = require('../utils/utils')
    
    // 查询所有没有group_code的群聊
    db.query(`SELECT id FROM group_chat WHERE group_code IS NULL OR group_code = ''`, (err, results) => {
        if (err) {
            console.error('查询没有group_code的群聊失败:', err)
            initGroupMembersTable()
            return
        }
        
        if (!results || results.length === 0) {
            console.log('所有群聊都已拥有group_code')
            initGroupMembersTable()
            return
        }
        
        console.log(`发现 ${results.length} 个群聊需要生成group_code`)
        
        // 为每个群聊生成唯一的group_code
        let processed = 0
        const total = results.length
        
        results.forEach((row) => {
            let groupCode = generateGroupCode()
            let attempts = 0
            const maxAttempts = 10
            
            // 生成唯一的group_code
            const generateUniqueCode = () => {
                db.query(`SELECT id FROM group_chat WHERE group_code = ?`, [groupCode], (err, checkResults) => {
                    if (err) {
                        console.error(`检查group_code失败 (群聊ID: ${row.id}):`, err)
                        processed++
                        if (processed === total) {
                            initGroupMembersTable()
                        }
                        return
                    }
                    
                    if (checkResults && checkResults.length > 0) {
                        // group_code已存在，重新生成
                        if (attempts < maxAttempts) {
                            attempts++
                            groupCode = generateGroupCode()
                            generateUniqueCode()
                            return
                        } else {
                            console.error(`为群聊 ${row.id} 生成唯一group_code失败，已达到最大尝试次数`)
                            processed++
                            if (processed === total) {
                                initGroupMembersTable()
                            }
                            return
                        }
                    }
                    
                    // group_code唯一，更新数据库
                    db.query(`UPDATE group_chat SET group_code = ? WHERE id = ?`, [groupCode, row.id], (updateErr) => {
                        if (updateErr) {
                            console.error(`更新群聊 ${row.id} 的group_code失败:`, updateErr)
                        } else {
                            console.log(`群聊 ${row.id} 的group_code已生成: ${groupCode}`)
                        }
                        processed++
                        if (processed === total) {
                            console.log('所有群聊的group_code生成完成')
                            initGroupMembersTable()
                        }
                    })
                })
            }
            
            generateUniqueCode()
        })
    })
}

//创建群聊表
function initGroupChatTable() {
    const sql = `CREATE TABLE IF NOT EXISTS group_chat (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        creator_id INT(11) NOT NULL,
        avatar VARCHAR(255),
        announcement TEXT,
        room VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_creator_id (creator_id),
        FOREIGN KEY (creator_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建group_chat表失败:', error);
        console.log('group_chat表创建成功')
        // 修改name字段，允许NULL（用于表示使用默认名称）
        db.query(`ALTER TABLE group_chat MODIFY COLUMN name VARCHAR(50) NULL`, (err) => {
            if (err && err.code !== 'ER_BAD_FIELD_ERROR') {
                // 字段已存在或其他错误，忽略
            }
        });
        // 添加is_disbanded字段（用于标记群聊是否已解散）
        // MySQL不支持IF NOT EXISTS，需要先检查字段是否存在
        db.query(`SHOW COLUMNS FROM group_chat LIKE 'is_disbanded'`, (err, results) => {
            if (err) {
                console.error('检查is_disbanded字段失败:', err)
            } else if (!results || results.length === 0) {
                // 字段不存在，添加字段
                db.query(`ALTER TABLE group_chat ADD COLUMN is_disbanded TINYINT(1) DEFAULT 0`, (err) => {
                    if (err) {
                        console.error('添加is_disbanded字段失败:', err)
                    } else {
                        console.log('is_disbanded字段添加成功')
                    }
                })
            }
        })
        // 添加group_code字段（8-10位随机数字，群id）
        db.query(`SHOW COLUMNS FROM group_chat LIKE 'group_code'`, (err, results) => {
            if (err) {
                console.error('检查group_code字段失败:', err)
                initGroupMembersTable()
            } else if (!results || results.length === 0) {
                // 字段不存在，添加字段
                db.query(`ALTER TABLE group_chat ADD COLUMN group_code VARCHAR(10) NULL`, (err) => {
                    if (err) {
                        console.error('添加group_code字段失败:', err)
                        initGroupMembersTable()
                    } else {
                        console.log('group_code字段添加成功')
                        // 为已存在的群聊生成group_code
                        generateGroupCodesForExistingGroups()
                    }
                })
            } else {
                // 字段已存在，检查是否有群聊没有group_code
                generateGroupCodesForExistingGroups()
            }
        })
    });
}

//创建群成员表
function initGroupMembersTable() {
    const sql = `CREATE TABLE IF NOT EXISTS group_members (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        nickname VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_group_id (group_id),
        FOREIGN KEY (group_id) REFERENCES group_chat(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建group_members表失败:', error);
        console.log('group_members表创建成功')
        initGroupRemarkTable()
    });
}

//创建群聊备注表（用户对群聊的个人备注）
function initGroupRemarkTable() {
    const sql = `CREATE TABLE IF NOT EXISTS group_remark (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT(11) NOT NULL,
        group_id INT(11) NOT NULL,
        remark VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_group (user_id, group_id),
        INDEX idx_user_id (user_id),
        INDEX idx_group_id (group_id),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES group_chat(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建group_remark表失败:', error);
        console.log('group_remark表创建成功')
        initGroupAdminTable()
    });
}

//创建群管理员表
function initGroupAdminTable() {
    const sql = `CREATE TABLE IF NOT EXISTS group_admin (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_group_user (group_id, user_id),
        INDEX idx_group_id (group_id),
        INDEX idx_user_id (user_id),
        FOREIGN KEY (group_id) REFERENCES group_chat(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建group_admin表失败:', error);
        console.log('group_admin表创建成功')
    });
}

//创建消息表
function initMessageTable() {
    const sql = `CREATE TABLE IF NOT EXISTS message (
        id INT(11) NOT NULL AUTO_INCREMENT,
        sender_id INT(11) NOT NULL,
        receiver_id INT(11) NOT NULL,
        content LONGTEXT NOT NULL,
        room VARCHAR(255) NOT NULL,
        type ENUM('private','group') NOT NULL,
        media_type ENUM('text','image','video','file') NOT NULL,
        file_size INT(11) NULL DEFAULT 0,
        status INT(1) NOT NULL DEFAULT 0,
        is_recalled TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_sender_id (sender_id),
        INDEX idx_room (room),
        INDEX idx_receiver_id (receiver_id),
        FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建message表失败:', error);
        console.log('message表创建成功')
        // 检查并添加is_recalled字段（如果不存在）
        db.query(`ALTER TABLE message ADD COLUMN is_recalled TINYINT(1) NOT NULL DEFAULT 0`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 字段已存在或其他错误，忽略
            }
        });
        // 修改media_type字段，添加'system'和'forward_multiple'类型
        db.query(`ALTER TABLE message MODIFY COLUMN media_type ENUM('text','image','video','file','system','forward_multiple') NOT NULL`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 忽略错误（字段可能已经包含这些类型）
            }
        });
        // 添加mention_all字段（是否@所有人）
        db.query(`ALTER TABLE message ADD COLUMN mention_all TINYINT(1) NOT NULL DEFAULT 0`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 字段已存在或其他错误，忽略
            }
        });
        // 添加requires_verification字段（是否需要验证）
        db.query(`ALTER TABLE message ADD COLUMN requires_verification TINYINT(1) NOT NULL DEFAULT 0`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 字段已存在或其他错误，忽略
            }
        });
        // 添加is_blocked字段（是否被拉黑）
        db.query(`ALTER TABLE message ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 字段已存在或其他错误，忽略
            }
        });
        initMessageStatisticsTable()
    });
}

//创建消息统计表
function initMessageStatisticsTable() {
    const sql = `CREATE TABLE IF NOT EXISTS message_statistics (
        id INT(11) NOT NULL AUTO_INCREMENT,
        room VARCHAR(255) NOT NULL,
        total INT(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_room (room)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建message_statistics表失败:', error);
        console.log('message_statistics表创建成功')
        initDeletedMessageTable()
    });
}

//创建已删除消息表（用于记录用户删除的消息，只对当前用户生效）
function initDeletedMessageTable() {
    const sql = `CREATE TABLE IF NOT EXISTS deleted_message (
        id INT(11) NOT NULL AUTO_INCREMENT,
        message_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_message_id (message_id),
        INDEX idx_user_id (user_id),
        UNIQUE KEY uk_message_user (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建deleted_message表失败:', error);
        console.log('deleted_message表创建成功')
        initMessageReadTable()
    });
}

//创建消息已读表（用于记录群聊中每个成员对每条消息的已读状态）
function initMessageReadTable() {
    const sql = `CREATE TABLE IF NOT EXISTS message_read (
        id INT(11) NOT NULL AUTO_INCREMENT,
        message_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_message_id (message_id),
        INDEX idx_user_id (user_id),
        INDEX idx_message_user (message_id, user_id),
        UNIQUE KEY uk_message_user (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建message_read表失败:', error);
        console.log('message_read表创建成功')
        initMessageMentionTable()
    });
}

//创建消息@表（用于记录消息中@的用户）
function initMessageMentionTable() {
    const sql = `CREATE TABLE IF NOT EXISTS message_mention (
        id INT(11) NOT NULL AUTO_INCREMENT,
        message_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_message_id (message_id),
        INDEX idx_user_id (user_id),
        INDEX idx_message_user (message_id, user_id),
        UNIQUE KEY uk_message_user (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建message_mention表失败:', error);
        console.log('message_mention表创建成功')
        initMessageMentionReadTable()
    });
}

//创建消息@已读表（用于记录用户已读的@消息）
function initMessageMentionReadTable() {
    const sql = `CREATE TABLE IF NOT EXISTS message_mention_read (
        id INT(11) NOT NULL AUTO_INCREMENT,
        message_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_message_id (message_id),
        INDEX idx_user_id (user_id),
        INDEX idx_message_user (message_id, user_id),
        UNIQUE KEY uk_message_user (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建message_mention_read表失败:', error);
        console.log('message_mention_read表创建成功')
        initPinnedChatTable()
    });
}

//创建置顶聊天表（用于记录用户置顶的聊天）
function initPinnedChatTable() {
    const sql = `CREATE TABLE IF NOT EXISTS pinned_chat (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        room VARCHAR(255) NOT NULL,
        pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_id (user_id),
        INDEX idx_room (room),
        UNIQUE KEY uk_user_room (user_id, room),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建pinned_chat表失败:', error);
        console.log('pinned_chat表创建成功')
        initMutedChatTable()
    });
}

//创建免打扰聊天表（用于记录用户免打扰的聊天）
function initMutedChatTable() {
    const sql = `CREATE TABLE IF NOT EXISTS muted_chat (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        room VARCHAR(255) NOT NULL,
        muted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_id (user_id),
        INDEX idx_room (room),
        UNIQUE KEY uk_user_room (user_id, room),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建muted_chat表失败:', error);
        console.log('muted_chat表创建成功')
    });
}

//创建收藏表
function initFavoriteTable() {
    const sql = `CREATE TABLE IF NOT EXISTS favorite (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        message_id INT(11) NOT NULL,
        type ENUM('image','file','message') NOT NULL,
        content LONGTEXT NOT NULL,
        file_size INT(11) NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_id (user_id),
        INDEX idx_message_id (message_id),
        INDEX idx_type (type),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建favorite表失败:', error);
        console.log('favorite表创建成功')
        initAIFriendTable()
    });
}

//创建AI好友表
function initAIFriendTable() {
    const sql = `CREATE TABLE IF NOT EXISTS ai_friend (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        room VARCHAR(255) NOT NULL,
        friend_type ENUM('warm','humorous','rational','energetic') NOT NULL DEFAULT 'warm',
        user_nickname VARCHAR(100) DEFAULT NULL COMMENT '用户昵称（AI如何称呼用户）',
        ai_name VARCHAR(100) DEFAULT NULL COMMENT 'AI名字（用户如何称呼AI）',
        context_cleared_at TIMESTAMP NULL DEFAULT NULL COMMENT '清空上下文的时间点',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_id (user_id),
        INDEX idx_room (room),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    
    db.query(sql, (error, results, fields) => {
        if (error) return console.log('创建ai_friend表失败:', error);
        console.log('ai_friend表创建成功')
        // 修改message表的type字段，添加'ai_friend'类型
        db.query(`ALTER TABLE message MODIFY COLUMN type ENUM('private','group','ai_friend') NOT NULL`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                // 忽略错误（字段可能已经包含这些类型）
            }
        });
        // 添加user_nickname字段（如果不存在）
        db.query(`ALTER TABLE ai_friend ADD COLUMN user_nickname VARCHAR(100) DEFAULT NULL COMMENT '用户昵称（AI如何称呼用户）'`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                console.log('添加user_nickname字段:', err?.message || '成功');
            } else if (!err) {
                console.log('添加user_nickname字段成功');
            }
        });
        // 添加ai_name字段（如果不存在）
        db.query(`ALTER TABLE ai_friend ADD COLUMN ai_name VARCHAR(100) DEFAULT NULL COMMENT 'AI名字（用户如何称呼AI）'`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                console.log('添加ai_name字段:', err?.message || '成功');
            } else if (!err) {
                console.log('添加ai_name字段成功');
            }
        });
        // 添加context_cleared_at字段（如果不存在）- 用于标记清空上下文的时间点
        db.query(`ALTER TABLE ai_friend ADD COLUMN context_cleared_at TIMESTAMP NULL DEFAULT NULL COMMENT '清空上下文的时间点'`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                console.log('添加context_cleared_at字段:', err?.message || '成功');
            } else if (!err) {
                console.log('添加context_cleared_at字段成功');
            }
        });
    });
}

//初始化表格
function initTables() {
    initUserTable()
    initFavoriteTable()
}

// 测试 mysql 模块能否正常工作
db.query('SELECT DATABASE() as current_db', (err, results) => {
    if (err) {
        console.log("数据库连接失败", err.message)
        process.exit(1);
    }
    // results 可能是数组格式 [[{current_db: 'chat'}]] 或 [{current_db: 'chat'}]
    let currentDb = 'unknown'
    if (Array.isArray(results) && results.length > 0) {
        const firstResult = Array.isArray(results[0]) ? results[0][0] : results[0]
        currentDb = firstResult ? firstResult.current_db : database
    }
    console.log(`数据库连接成功，当前数据库: ${currentDb}`)
    if (currentDb !== database && currentDb !== 'unknown') {
        console.log(`⚠️  警告: 当前连接的数据库(${currentDb})与配置的数据库(${database})不一致！`)
    }
    initTables()
})

//将连接好的数据库对象向外导出,供外界使用
module.exports = db

