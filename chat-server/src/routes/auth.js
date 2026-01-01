const express = require('express');
const router = express.Router();
const auth = require("../container/auth/index")
const multer = require('multer');
const path = require('path');
const { notExitCreate } = require('../utils/utils');
const { authenticateToken } = require('../middleware/auth');

// 创建上传目录
notExitCreate(path.join(process.cwd(), 'uploads/avatar'));

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(process.cwd(), 'uploads/avatar'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.post('/login', auth.Login)
router.post('/login-email', auth.LoginWithEmail)
router.post('/quick-login', authenticateToken, auth.QuickLogin)
router.post('/register', upload.single('avatar'), auth.Register)
router.post('/send-code', auth.SendVerificationCode)
router.post('/forget-password', auth.ForgetPassword)
router.post('/update-info', authenticateToken, upload.single('avatar'), auth.updateInfo)
router.post('/update-username', authenticateToken, auth.UpdateUsername)

module.exports = router;
