const express = require('express');
const router = express.Router();
const favorite = require("../container/favorite/index")
const { authenticateToken } = require('../middleware/auth');

router.get('/list', authenticateToken, favorite.GetFavorites)
router.post('/add', authenticateToken, favorite.AddFavorite)
router.post('/remove', authenticateToken, favorite.RemoveFavorite)

module.exports = router;

