const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { notExitCreate } = require('./utils/utils');

const authRoutes = require('./routes/auth');
const friendRoutes = require('./routes/friend');
const groupRoutes = require('./routes/group');
const messageRoutesFunc = require('./routes/message'); // WebSocket路由需要函数形式
const favoriteRoutes = require('./routes/favorite');
const deepseekRoutesFunc = require('./routes/deepseek'); // DeepSeek路由需要函数形式
const aiFriendRoutesFunc = require('./routes/ai-friend'); // AI好友路由需要函数形式

const app = express();
expressWs(app);

// 解决跨域
const corsMiddleware = (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    res.header("Content-Type", "application/json;charset=utf-8")

    if (req.method.toLowerCase() == 'options')
        res.sendStatus(200);
    else
        next();
}

// 静态文件CORS中间件
const staticCors = (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    
    if (req.method.toLowerCase() == 'options')
        res.sendStatus(200);
    else
        next();
}

// MIME类型映射
const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.webm': 'video/webm'
};

// 创建上传目录
notExitCreate(path.join(process.cwd(), 'uploads'));
notExitCreate(path.join(process.cwd(), 'uploads/avatar'));
notExitCreate(path.join(process.cwd(), 'uploads/group'));
notExitCreate(path.join(process.cwd(), 'uploads/message'));

// 配置静态文件服务，使用setHeaders来设置正确的MIME类型
app.use("/uploads", staticCors, express.static('uploads', {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        
        // 如果是图片或其他可预览的文件，设置正确的MIME类型
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
            // 图片文件不设置Content-Disposition，允许浏览器预览
            if (ext.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i)) {
                // 图片文件允许预览，不强制下载
            } else {
                // 其他文件类型可以预览（如PDF、文本等）
            }
        } else {
            // 未知文件类型，设置为下载模式
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment');
        }
    }
}));

// 中间件
app.use(corsMiddleware);
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// 路由
app.use('/api/chat/v1/auth', corsMiddleware, authRoutes);
app.use('/api/chat/v1/friend', corsMiddleware, friendRoutes);
app.use('/api/chat/v1/group', corsMiddleware, groupRoutes);
app.use('/api/chat/v1/message', corsMiddleware, messageRoutesFunc());
app.use('/api/chat/v1/favorite', corsMiddleware, favoriteRoutes);
app.use('/api/chat/v1/deepseek', corsMiddleware, deepseekRoutesFunc());
app.use('/api/chat/v1/ai-friend', corsMiddleware, aiFriendRoutesFunc());

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: '接口不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
});

module.exports = app;
