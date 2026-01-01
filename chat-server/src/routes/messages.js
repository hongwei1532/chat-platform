const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// 获取所有留言
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT lyTable.*, userTable.Username 
       FROM lyTable 
       JOIN userTable ON lyTable.userId = userTable.id 
       ORDER BY lyTable.date DESC`
    );
    res.json({ success: true, messages: rows });
  } catch (e) {
    console.error('获取留言错误:', e);
    res.status(500).json({ success: false, message: '数据库错误' });
  }
});

// 发布留言（需要认证）
router.post('/', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  const userId = req.user.userId;
  
  if (!title || !content) {
    return res.json({ success: false, message: '标题和内容不能为空' });
  }
  
  try {
    const now = new Date();
    await pool.query(
      'INSERT INTO lyTable (userId, date, title, content) VALUES (?, ?, ?, ?)',
      [userId, now, title, content]
    );
    res.json({ success: true, message: '发布成功' });
  } catch (e) {
    console.error('发布留言错误:', e);
    res.status(500).json({ success: false, message: '数据库错误' });
  }
});

module.exports = router;

