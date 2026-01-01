module.exports = {
    Login,
    Register,
    ForgetPassword,
    updateInfo,
    SendVerificationCode,
    LoginWithEmail,
    UpdateUsername,
    QuickLogin
};

const { secretKey, sign } = require('../../config/jwt');
const { RespUserOrPassErr, RespParamErr, RespServerErr, RespUserExitErr, RespUpdateErr, RespUserNotExitErr } = require('../../model/error');
const { RespData, RespSuccess, RespError } = require('../../model/resp');
const { Query } = require('../../db/query');
const crypto = require('crypto');

/**
 * 登录基本逻辑
 * 支持两种方式：
 * 1. 邮箱 + 密码
 * 2. 邮箱 + 验证码（通过LoginWithEmail处理）
 */
async function Login(req, res) {
    const { email, password } = req.body
    console.log('登录请求:', { email, password: password ? '***' : 'empty' })
    
    if (!(email && password)) {
        return RespError(res, RespParamErr)
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return RespError(res, { code: 4001, message: '邮箱格式不正确' });
    }
    
    const sql = 'SELECT * FROM user WHERE email=?'
    let { err, results } = await Query(sql, [email])
    // 查询数据失败
    if (err) {
        console.error('查询用户失败:', err)
        return RespError(res, RespServerErr)
    }
    // 查询数据成功
    if (results.length == 0) {
        console.log('用户不存在:', email)
        return RespError(res, RespUserOrPassErr)
    }
    
    const payload = {
        id: results[0].id,
        avatar: results[0].avatar,
        username: results[0].username,
        password: results[0].password,
        name: results[0].name,
        phone: results[0].phone,
        salt: results[0].salt
    }
    //加盐验证
    let M = payload.salt.slice(0, 3) + password + payload.salt.slice(3);
    // 将M进行MD5哈希，得到哈希值
    let hash = crypto.createHash('md5').update(M).digest('hex');
    if (hash != payload.password) {
        console.log('密码错误:', email)
        return RespError(res, RespUserOrPassErr)
    }
    
    const token = sign({
        id: payload.id,
        username: payload.username,
        name: payload.name
    });
    
    console.log('登录成功，用户ID:', payload.id, '邮箱:', email)
    
    let data = {
        token: token,
        info: {
            id: results[0].id,
            avatar: results[0].avatar,
            username: results[0].username,
            name: results[0].name,
            phone: results[0].phone,
            email: results[0].email,
            created_at: new Date(results[0].created_at).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
            signature: results[0].signature,
        }
    }
    return RespData(res, data)
}

/**
 * 注册的基本逻辑
 * 1.获取到前端传来的name(昵称)、email、code(验证码)、password、avatar(可选)
 * 2.验证邮箱格式和验证码
 * 3.验证密码格式
 * 4.检查邮箱是否已注册
 * 5.随机生成用户名（6-20字符，无特殊字符）
 * 6.插入user表
 * 7.给新用户添加一个好友分组
 * 8.生成jwt,把token返回给前端要前端进行保存 
 */
async function Register(req, res) {
    const { name, email, code, password } = req.body
    let fileName = null
    if (req.file) {
        fileName = req.file.filename;
    }
    
    console.log('注册请求:', { name, email, password: password ? '***' : 'empty', code: code ? '***' : 'empty', hasAvatar: !!fileName })
    
    // 验证必填字段
    if (!email || !code || !password || !name) {
        return RespError(res, { code: 4007, message: '昵称、邮箱、验证码、密码均为必填项' });
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return RespError(res, { code: 4001, message: '邮箱格式不正确' });
    }
    
    // 验证验证码
    const { verifyCode } = require('../../utils/verificationCode');
    const verifyResult = verifyCode(email, code);
    
    if (!verifyResult.valid) {
        return RespError(res, { code: 4003, message: verifyResult.message });
    }
    
    // 验证密码格式
    const { validatePassword } = require('../../utils/passwordValidator');
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        return RespError(res, { code: 4008, message: passwordValidation.message });
    }
    
    // 检查邮箱是否已被注册
    const checkEmailSql = 'SELECT id FROM user WHERE email=?';
    const emailCheck = await Query(checkEmailSql, [email]);
    if (emailCheck.err) {
        console.error('检查邮箱失败:', emailCheck.err);
        return RespError(res, RespServerErr);
    }
    if (emailCheck.results.length > 0) {
        return RespError(res, { code: 4006, message: '该邮箱已被注册' });
    }
    
    // 生成随机用户名
    const { generateUniqueUsername } = require('../../utils/usernameGenerator');
    const username = await generateUniqueUsername(Query);
    console.log('生成的用户名:', username);
    
    //3个字节的字节码转化成16进制字符串，生成一个6位的salt
    const salt = crypto.randomBytes(3).toString('hex')
    
    //加盐
    let M = salt.slice(0, 3) + password + salt.slice(3);
    // 将M进行MD5哈希，得到哈希值
    let hash = crypto.createHash('md5').update(M).digest('hex');
    
    let user = {
        avatar: fileName ? `/uploads/avatar/${fileName}` : "",
        username: username,
        password: hash,
        name: name,
        phone: "",
        email: email,
        signature: "",
        salt: salt
    }
    const sqlStr = 'INSERT INTO user SET ?'
    let res2 = await Query(sqlStr, user)
    let err = res2.err
    let result2 = res2.results
    // 执行 SQL 语句失败了
    if (err) {
        console.error('插入用户失败:', err)
        // 如果是唯一约束冲突，可能是用户名重复（虽然概率很低）
        if (err.code === 'ER_DUP_ENTRY') {
            // 重新生成用户名并重试（最多重试一次）
            const { generateUniqueUsername } = require('../../utils/usernameGenerator');
            const newUsername = await generateUniqueUsername(Query);
            user.username = newUsername;
            const retryRes = await Query(sqlStr, user);
            if (retryRes.err) {
                console.error('重试插入用户失败:', retryRes.err)
                return RespError(res, RespServerErr)
            }
            result2 = retryRes.results;
            err = null;
        } else {
        return RespError(res, RespServerErr)
        }
    }
    console.log('用户插入成功，affectedRows:', result2.affectedRows)
    if (result2.affectedRows === 1) {
        // 获取用户信息（使用email查询，因为username可能被重试修改过）
        const getUserSql = 'SELECT * FROM user WHERE email=?'
        let userInfo = await Query(getUserSql, [email])
        if (userInfo.err) {
            console.error('获取用户信息失败:', userInfo.err)
            return RespError(res, RespServerErr)
        }
        let info = userInfo.results[0]
        console.log('注册成功，用户ID:', info.id, '用户名:', info.username, '邮箱:', info.email)
        
        let friend_group = {
            user_id: info.id,
            username: info.username,
            name: "我的好友",
        }
        //创建一个新的分组
        let sqlStr2 = 'INSERT INTO friend_group SET ?'
        let groupRes = await Query(sqlStr2, friend_group)
        if (groupRes.err) {
            console.error('创建好友分组失败:', groupRes.err)
            return RespError(res, RespServerErr)
        }
        
        const payload = {
            id: info.id,
            username: info.username,
            name: info.name,
        }
        const token = sign(payload);
        console.log('生成Token成功，用户ID:', info.id)
        let data = {
            token: token,
            info: {
                id: info.id,
                avatar: info.avatar,
                username: info.username,
                name: info.name,
                phone: info.phone,
                created_at: new Date(info.created_at).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
                signature: info.signature,
            }
        }
        return RespData(res, data)
    } else {
        console.error('用户插入失败，affectedRows:', result2.affectedRows)
        return RespError(res, RespServerErr)
    }
}

/**
 * 修改用户信息
 * 1.判断用户是否上传了头像,如果上传了则获取文件名
 * 2.获取用户名,phone,个性签名
 * 3.当头像存在,则设置头像路径
 * 4.将修改user表中的数据
 */
async function updateInfo(req, res) {
    // 从认证中间件获取用户信息
    const username = req.user.username
    let fileName
    if (req.file) {
        fileName = req.file.filename;
    }
    const { phone, signature, name, interests } = req.body
    let info = {}
    
    // 只在明确传入时才更新字段，避免清空其他字段
    if (phone !== undefined && phone !== null) {
        info.phone = phone
    }
    if (signature !== undefined && signature !== null) {
        info.signature = signature
    }
    // 如果传入了interests，则更新兴趣爱好
    // interests字段是JSON类型，需要将逗号分隔的字符串转换为JSON数组
    if (interests !== undefined && interests !== null) {
        if (typeof interests === 'string' && interests.trim() !== '') {
            // 将逗号分隔的字符串转换为JSON数组
            const interestsArray = interests.split(',').map(tag => tag.trim()).filter(tag => tag)
            info.interests = JSON.stringify(interestsArray)
        } else if (interests === '') {
            // 空字符串，设置为空JSON数组
            info.interests = JSON.stringify([])
        } else {
            // 如果已经是数组或其他格式，直接使用
            info.interests = interests
        }
    }
    // 如果传入了name，则更新昵称
    if (name !== undefined && name !== null) {
        info.name = name
    }
    if (fileName) {
        info.avatar = `/uploads/avatar/${fileName}`
    }
    
    // 如果没有要更新的字段，直接返回
    if (Object.keys(info).length === 0) {
        // 返回完整的用户信息
        const getUserSql = 'SELECT id, avatar, username, name, phone, signature, interests FROM user WHERE username=?'
        const userResult = await Query(getUserSql, [username])
        if (userResult.err) {
            return RespError(res, RespServerErr)
        }
        return RespData(res, { 
            user: userResult.results[0]
        })
    }
    
    const sql = 'UPDATE user SET ? WHERE username=?'
    let { err, results } = await Query(sql, [info, username])
    // 执行 SQL 语句失败了
    if (err) return RespError(res, RespServerErr)
    if (results.affectedRows === 1) {
        // 返回完整的用户信息
        const getUserSql = 'SELECT id, avatar, username, name, phone, signature, interests FROM user WHERE username=?'
        const userResult = await Query(getUserSql, [username])
        if (userResult.err) {
            return RespError(res, RespServerErr)
        }
        return RespData(res, { 
            avatar: info.avatar || userResult.results[0].avatar,
            user: userResult.results[0]
        })
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 忘记密码
 * 1.通过邮箱和验证码验证身份
 * 2.验证新密码格式
 * 3.更新密码
 */
async function ForgetPassword(req, res) {
    const { email, code, password } = req.body
    if (!(email && code && password)) {
        return RespError(res, RespParamErr)
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return RespError(res, { code: 4001, message: '邮箱格式不正确' });
    }
    
    // 验证验证码
    const { verifyCode } = require('../../utils/verificationCode');
    const verifyResult = verifyCode(email, code);
    
    if (!verifyResult.valid) {
        return RespError(res, { code: 4003, message: verifyResult.message });
    }
    
    // 验证密码格式
    const { validatePassword } = require('../../utils/passwordValidator');
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        return RespError(res, { code: 4008, message: passwordValidation.message });
    }
    
    const sql = 'SELECT id, salt FROM user WHERE email=?'
    //判断用户是否存在
    let { err, results } = await Query(sql, [email])
    // 查询数据失败
    if (err) return RespError(res, RespServerErr)
    // 查询数据成功
    if (results.length == 0) {
        return RespError(res, RespUserNotExitErr)
    }
    
    const salt = results[0].salt
    const M = salt.slice(0, 3) + password + salt.slice(3);
    // 将M进行MD5哈希，得到哈希值
    const hash = crypto.createHash('md5').update(M).digest('hex');
    const sqlStr = 'UPDATE user SET password=? WHERE email=?'
    let updateRes = await Query(sqlStr, [hash, email])
    // 执行 SQL 语句失败了
    if (updateRes.err) return RespError(res, RespServerErr)
    if (updateRes.results.affectedRows === 1) {
        console.log('密码重置成功，邮箱:', email)
        return RespSuccess(res)
    }
    return RespError(res, RespUpdateErr)
}

/**
 * 发送邮箱验证码
 * 1.验证邮箱格式
 * 2.检查发送频率（防止刷屏）
 * 3.生成验证码并发送邮件
 */
async function SendVerificationCode(req, res) {
    const { email } = req.body;
    
    if (!email) {
        return RespError(res, RespParamErr);
    }
    
    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return RespError(res, { code: 4001, message: '邮箱格式不正确' });
    }
    
    // 检查是否已有验证码（限制发送频率，60秒内只能发送一次）
    const { hasCode } = require('../../utils/verificationCode');
    if (hasCode(email)) {
        return RespError(res, { code: 4002, message: '验证码已发送，请稍后再试（60秒内只能发送一次）' });
    }
    
    // 生成并存储验证码
    const { storeCode } = require('../../utils/verificationCode');
    const code = storeCode(email);
    
    // 发送邮件
    const { sendVerificationCode } = require('../../utils/email');
    const sent = await sendVerificationCode(email, code);
    
    if (sent) {
        console.log('验证码已发送到:', email);
        return RespSuccess(res, { message: '验证码已发送，请查收邮件' });
    } else {
        return RespError(res, { code: 5001, message: '验证码发送失败，请检查邮箱配置或稍后重试' });
    }
}

/**
 * 使用邮箱+验证码登录
 * 1.验证邮箱和验证码
 * 2.查找用户（通过邮箱）
 * 3.生成JWT并返回
 */
async function LoginWithEmail(req, res) {
    const { email, code } = req.body;
    
    if (!(email && code)) {
        return RespError(res, RespParamErr);
    }
    
    // 验证验证码
    const { verifyCode } = require('../../utils/verificationCode');
    const verifyResult = verifyCode(email, code);
    
    if (!verifyResult.valid) {
        return RespError(res, { code: 4003, message: verifyResult.message });
    }
    
    // 查找用户（通过邮箱）
    const sql = 'SELECT * FROM user WHERE email=?';
    let { err, results } = await Query(sql, [email]);
    
    if (err) {
        console.error('查询用户失败:', err);
        return RespError(res, RespServerErr);
    }
    
    if (results.length === 0) {
        console.log('用户不存在:', email);
        return RespError(res, { code: 4004, message: '该邮箱未注册，请先注册' });
    }
    
    const user = results[0];
    const payload = {
        id: user.id,
        username: user.username,
        name: user.name
    };
    
    const token = sign(payload);
    console.log('邮箱登录成功，用户ID:', user.id, '邮箱:', email);
    
    let data = {
        token: token,
        info: {
            id: user.id,
            avatar: user.avatar,
            username: user.username,
            name: user.name,
            phone: user.phone,
            email: user.email,
            created_at: new Date(user.created_at).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
            signature: user.signature,
        }
    };
    return RespData(res, data);
}

/**
 * 修改用户名
 * 1.验证密码
 * 2.验证新用户名格式（6-20字符，无特殊字符）
 * 3.检查用户名是否已存在
 * 4.更新用户名
 */
async function UpdateUsername(req, res) {
    const userId = req.user.id  // 使用 ID 而不是 username，因为 ID 不会改变
    const { newUsername, password } = req.body
    
    if (!(newUsername && password)) {
        return RespError(res, RespParamErr)
    }
    
    // 验证新用户名格式
    const newUsernameTrimmed = newUsername.trim()
    if (newUsernameTrimmed.length < 6 || newUsernameTrimmed.length > 20) {
        return RespError(res, { code: 4009, message: '用户名长度必须在6-20个字符之间' });
    }
    
    // 检查是否包含特殊字符（只允许字母和数字）
    if (!/^[a-zA-Z0-9]+$/.test(newUsernameTrimmed)) {
        return RespError(res, { code: 4010, message: '用户名只能包含字母和数字，不能有特殊字符' });
    }
    
    // 先查询当前用户的用户名
    const currentUserSql = 'SELECT id, username, password, salt FROM user WHERE id=?'
    let { err, results } = await Query(currentUserSql, [userId])
    if (err) {
        console.error('查询用户失败:', err)
        return RespError(res, RespServerErr)
    }
    if (results.length == 0) {
        return RespError(res, RespUserNotExitErr)
    }
    
    const currentUsername = results[0].username
    
    // 检查是否和当前用户名相同
    if (newUsernameTrimmed === currentUsername) {
        return RespError(res, { code: 4011, message: '新用户名不能与当前用户名相同' });
    }
    
    // 检查用户名是否已存在
    const checkUsernameSql = 'SELECT id FROM user WHERE username=?';
    const usernameCheck = await Query(checkUsernameSql, [newUsernameTrimmed]);
    if (usernameCheck.err) {
        console.error('检查用户名失败:', usernameCheck.err);
        return RespError(res, RespServerErr);
    }
    if (usernameCheck.results.length > 0) {
        return RespError(res, { code: 4012, message: '该用户名已存在，请使用其他用户名' });
    }
    
    // 验证密码
    const salt = results[0].salt
    const M = salt.slice(0, 3) + password + salt.slice(3);
    const hash = crypto.createHash('md5').update(M).digest('hex');
    if (hash != results[0].password) {
        console.log('密码错误，用户ID:', userId)
        return RespError(res, RespUserOrPassErr)
    }
    
    // 更新用户名（使用 ID 而不是 username，避免 token 中的 username 过时的问题）
    const updateSql = 'UPDATE user SET username=? WHERE id=?'
    let updateRes = await Query(updateSql, [newUsernameTrimmed, userId])
    if (updateRes.err) {
        console.error('更新用户名失败:', updateRes.err)
        return RespError(res, RespServerErr)
    }
    
    if (updateRes.results.affectedRows === 1) {
        // 同时更新 friend_group 表中的 username（使用 user_id 匹配，更可靠）
        const updateGroupSql = 'UPDATE friend_group SET username=? WHERE user_id=?'
        const updateGroupRes = await Query(updateGroupSql, [newUsernameTrimmed, userId])
        if (updateGroupRes.err) {
            console.error('更新friend_group表username失败:', updateGroupRes.err)
        } else {
            console.log('friend_group表更新成功，影响行数:', updateGroupRes.results.affectedRows)
        }
        
        // 更新 friend 表中的 username（更新所有其他用户的好友列表中该用户的username）
        const updateFriendSql = 'UPDATE friend SET username=? WHERE user_id=?'
        const updateFriendRes = await Query(updateFriendSql, [newUsernameTrimmed, userId])
        if (updateFriendRes.err) {
            console.error('更新friend表username失败:', updateFriendRes.err)
        } else {
            console.log('friend表更新成功，影响行数:', updateFriendRes.results.affectedRows)
        }
        
        console.log('用户名更新成功，从', currentUsername, '更新为', newUsernameTrimmed)
        return RespSuccess(res, { message: '用户名更新成功', username: newUsernameTrimmed })
    }
    
    return RespError(res, RespUpdateErr)
}

/**
 * 快速登录（通过token）
 * 1.验证token是否有效
 * 2.如果有效，返回用户信息
 * 3.如果无效，返回错误
 */
async function QuickLogin(req, res) {
    // 从认证中间件获取用户信息（token已经验证）
    const userId = req.user.id;
    
    // 查询用户信息
    const sql = 'SELECT * FROM user WHERE id=?';
    let { err, results } = await Query(sql, [userId]);
    
    if (err) {
        console.error('查询用户失败:', err);
        return RespError(res, RespServerErr);
    }
    
    if (results.length === 0) {
        console.log('用户不存在，用户ID:', userId);
        return RespError(res, RespUserNotExitErr);
    }
    
    const user = results[0];
    console.log('快速登录成功，用户ID:', user.id, '邮箱:', user.email);
    
    // 获取token（去除Bearer前缀如果存在）
    let token = req.headers.authorization;
    if (token && token.startsWith('Bearer ')) {
        token = token.slice(7);
    }
    token = token ? token.trim() : '';
    
    let data = {
        token: token, // 返回原token
        info: {
            id: user.id,
            avatar: user.avatar,
            username: user.username,
            name: user.name,
            phone: user.phone,
            email: user.email,
            created_at: new Date(user.created_at).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
            signature: user.signature,
        }
    };
    return RespData(res, data);
}

