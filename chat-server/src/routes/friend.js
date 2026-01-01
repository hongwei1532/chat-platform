const express = require('express');
const router = express.Router();
const friend = require("../container/friend/index")
const { authenticateToken } = require('../middleware/auth');

router.get('/list', authenticateToken, friend.List)
router.post('/add', authenticateToken, friend.AddFriend)
router.get('/search', authenticateToken, friend.SearchUser)
router.get('/info', authenticateToken, friend.getFriendInfo)
router.get('/user-info', authenticateToken, friend.getUserInfo)
router.post('/group/create', authenticateToken, friend.createFriendGroup)
router.post('/group/update', authenticateToken, friend.updateFriendGroup)
router.post('/update', authenticateToken, friend.updateFriendInfo)
router.post('/update-remark', authenticateToken, friend.updateFriendRemark)
router.get('/group/list', authenticateToken, friend.getFriendGroupList)
router.post('/request/send', authenticateToken, friend.SendFriendRequest)
router.get('/request/list', authenticateToken, friend.GetFriendRequests)
router.post('/request/respond', authenticateToken, friend.RespondFriendRequest)
router.post('/delete', authenticateToken, friend.DeleteFriend)
router.post('/block', authenticateToken, friend.BlockFriend)
router.post('/unblock', authenticateToken, friend.UnblockFriend)
router.get('/blacklist', authenticateToken, friend.GetBlacklist)
router.get('/recommendations', authenticateToken, friend.GetRecommendations)
router.get('/recommendation-reason', authenticateToken, friend.GetRecommendationReason)

module.exports = router;

