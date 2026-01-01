const express = require('express');
const router = express.Router();
const group = require("../container/group/index")
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { notExitCreate } = require('../utils/utils');

// 创建上传目录
notExitCreate(path.join(process.cwd(), 'uploads/group'));

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(process.cwd(), 'uploads/group'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/list', authenticateToken, group.List)
router.get('/members', authenticateToken, group.MembersList)
router.post('/create', authenticateToken, upload.single('avatar'), group.CreateGroupChat)
router.get('/search', authenticateToken, group.SearchGroupChat)
router.get('/join', authenticateToken, group.JoinGroupChat)
router.get('/info', authenticateToken, group.GroupInfo)
router.post('/rename', authenticateToken, group.RenameGroup)
router.post('/invite', authenticateToken, group.invitedUsersToGroup)
router.post('/update-avatar', authenticateToken, upload.single('avatar'), group.UpdateGroupAvatar)
router.post('/update-remark', authenticateToken, group.UpdateGroupRemark)
router.get('/remark', authenticateToken, group.GetGroupRemark)
router.post('/update-nickname', authenticateToken, group.UpdateGroupNickname)
router.post('/leave', authenticateToken, group.LeaveGroup)
router.post('/transfer-ownership', authenticateToken, group.TransferGroupOwnership)
router.post('/disband', authenticateToken, group.DisbandGroup)
router.get('/admins', authenticateToken, group.GetGroupAdmins)
router.post('/add-admins', authenticateToken, group.AddGroupAdmins)
router.post('/remove-admin', authenticateToken, group.RemoveGroupAdmin)
router.post('/remove-member', authenticateToken, group.RemoveGroupMember)
router.post('/update-announcement', authenticateToken, group.UpdateAnnouncement)
router.post('/publish-announcement', authenticateToken, group.PublishAnnouncement)

module.exports = router;

