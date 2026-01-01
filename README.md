# 桌面即时通讯聊天平台

一个基于 Electron + Vue 3 的现代化桌面聊天应用，支持私聊、群聊、AI 好友对话、文件传输等完整即时通讯功能。

[![Vue](https://img.shields.io/badge/Vue-3.0-4fc08d.svg)](https://vuejs.org/) [![Electron](https://img.shields.io/badge/Electron-39.0-47848f.svg)](https://electronjs.org/) [![MySQL](https://img.shields.io/badge/MySQL-8.0-00758f.svg)](https://mysql.com/)



## 📖 项目简介

本项目是一款功能完整的桌面即时通讯平台，采用前后端分离架构，提供类似微信/Facebook Messenger 的核心体验。系统支持实时消息推送、好友管理、群组聊天、消息收藏、AI 智能对话等丰富功能，适合企业内部或小规模社区日常沟通使用。



## ✨ 核心功能

### 用户认证功能

- ✅ 邮箱注册/登录（支持验证码登录）
- ✅ JWT Token 无状态认证
- ✅ 忘记密码与密码重置
- ✅ 用户头像与个人信息管理

### 好友管理功能

- ✅ 搜索用户并发送好友申请
- ✅ 好友分组管理（创建/编辑/删除分组）
- ✅ 好友备注与黑名单管理
- ✅ 基于兴趣爱好的智能好友推荐（AI 算法驱动）

### 群组聊天功能

- ✅ 创建/解散群组，邀请/移除成员
- ✅ 群主、管理员、普通成员三级权限体系
- ✅ 群公告与群聊昵称设置
- ✅ @提及功能（支持@所有人）

### 消息功能

- ✅ 实时消息推送（WebSocket）
- ✅ 支持文本、图片、文件、表情等多种消息类型
- ✅ 消息撤回（2 分钟内）、删除、转发、收藏
- ✅ 未读消息计数与已读回执
- ✅ 聊天记录分页查询与搜索
- ✅ AI 推荐消息回复（根据聊天上下文智能推荐回复内容）

### AI 好友功能

- ✅ 4 种 AI 人格类型：温暖倾听型、幽默开朗型、理性分析型、活力鼓励型
- ✅ 流式响应，实时显示 AI 回复
- ✅ 上下文管理（保留最近 20 条消息）
- ✅ 基于 DeepSeek API 的智能对话

### 系统通知

- ✅ 好友申请通知
- ✅ 群成员变动通知
- ✅ 系统消息推送



## 🛠 技术栈

### 前端应用 (`chat-app`)

- **Electron 29.0.0** - 跨平台桌面应用框架
- **Vue 3.5.22** - 渐进式 JavaScript 框架
- **Vite** - 前端构建工具
- **WebSocket 客户端** - 实时通信

### 后端服务 (`chat-server`)

- **Node.js 16.0.0+** (推荐 18.x LTS) - JavaScript 运行时
- **Express 4.21.2** - Web 应用框架
- **WebSocket** - 实时双向通信
- **JWT** - 身份认证
- **bcrypt** - 密码加密
- **Nodemailer** - 邮件服务

### 数据库与存储

- **MySQL 8.0+** - 关系型数据库
- **InnoDB 引擎** - 支持事务和外键
- **utf8mb4 字符集** - 支持 Emoji 表情
- **本地文件系统** - 文件存储（上传至`uploads/`目录）

### 外部服务

- **DeepSeek API** - AI 对话服务
- **SMTP 邮件服务器** - 验证码发送



## 📐 系统架构

```
前端应用层 (Electron + Vue 3)
├─ Electron主进程层 (main.js) - 窗口管理、系统托盘
├─ Vue渲染进程层 - 用户界面与交互
│  ├─ ChatRoom.vue - 聊天室主组件 (12,000行)
│  ├─ Login.vue - 登录组件 (1,300行)
│  └─ API客户端 (client.js) - HTTP/WebSocket封装
└─ 本地存储 (LocalStorage) - Token与账户信息

通信层
├─ HTTP/HTTPS - RESTful API
└─ WebSocket (WS/WSS) - 实时消息推送

后端服务层 (Node.js + Express)
├─ 路由层 (Routes) - RESTful API定义
├─ 控制器层 (Containers) - 业务逻辑实现
│  ├─ 认证模块 (auth) - 注册/登录/Token (650行)
│  ├─ 消息模块 (message) - WebSocket通信 (3,700行)
│  ├─ 好友模块 (friend) - 好友关系管理 (1,200行)
│  ├─ 群组模块 (group) - 群聊管理 (1,500行)
│  └─ AI好友模块 (ai-friend) - AI对话 (800行)
├─ 数据访问层 (db) - 数据库连接与查询封装
├─ 工具层 (utils) - 邮件、加密、验证等
└─ 中间件层 (middleware) - JWT认证、错误处理

数据持久层
├─ MySQL数据库
│  ├─ users - 用户表
│  ├─ friendships - 好友关系表
│  ├─ group_chat - 群聊表
│  ├─ messages - 消息表
│  └─ ai_friend - AI好友配置表
└─ 文件存储 (uploads/)
   ├─ avatar/ - 用户头像
   ├─ group/ - 群头像
   └─ message/ - 聊天文件
```



## 🚀 快速开始

### 环境要求

- **操作系统**: Windows 10/11
- **Node.js**: 16.0.0 或更高版本（推荐 18.x LTS）
- **npm**: 7.0.0 或更高版本（随 Node.js 安装）
- **MySQL**: 8.0 或更高版本
- **内存**: 客户端 4GB+ / 服务端 8GB+

### 安装步骤

#### 1. 克隆项目到本地

```bash
git clone https://github.com/yourorg/chat-platform.git
cd chat-platform
```

#### 2. 后端服务安装

```bash
cd chat-server

# 安装依赖（可能需要几分钟）
npm install

# 配置数据库
# 方法1: 创建 config.json 文件
# config.json 文件中添加以下内容：
{
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "your_mysql_password",
  "database": "chat"
}


# 方法2: 创建 .env 文件
# .env 文件中添加以下内容：
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=chat

# 创建数据库（可选）
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 启动服务
npm start
# 或开发模式（支持自动重启）
npm run dev
```

验证安装：访问健康检查接口

```bash
curl http://localhost:3000/health
# 应返回: {"status":"ok"}
```

#### 3. 前端应用安装

如果您启动了后端服务，可以直接下载 Releases 中的可执行文件，双击运行即可，并跳过以下步骤。

```bash
cd chat-app

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 打包应用（生产环境）
npm run build
```

#### 4. 首次运行配置

1. 启动应用后会弹出配置窗口
2. 输入后端 API 地址（默认：`http://localhost:3000`）
3. 点击"保存并继续"



## 📦 项目结构

```
chat-platform/
├── chat-server/                 # 后端服务
│   ├── server.js               # 服务入口
│   ├── src/
│   │   ├── app.js              # Express应用配置
│   │   ├── routes/             # API路由
│   │   ├── container/         # 业务逻辑模块
│   │   ├── db/                 # 数据库连接与初始化
│   │   ├── middleware/         # 中间件
│   │   └── utils/              # 工具函数
│   ├── .env                 # 配置文件
│   └── package.json
│
├── chat-app/                   # 前端应用
│   ├── electron/
│   │   ├── main.js            # Electron主进程
│   │   └── preload.mjs        # 预加载脚本
│   ├── src/
│   │   ├── main.js            # Vue应用入口
│   │   ├── App.vue            # 根组件
│   │   ├── components/        # Vue组件
│   │   ├── api/               # API客户端
│   │   └── utils/             # 工具函数
│   ├── vite.config.js         # Vite配置
│   └── package.json
│
└── README.md                   # 项目说明
```



## 🔌 核心 API 接口

### 认证接口

- `POST /api/chat/v1/auth/register` - 用户注册
- `POST /api/chat/v1/auth/login` - 邮箱+密码登录
- `POST /api/chat/v1/auth/login-email` - 邮箱+验证码登录
- `POST /api/chat/v1/auth/send-code` - 发送验证码
- `POST /api/chat/v1/auth/quick-login` - Token 快速登录

### 好友接口

- `GET /api/chat/v1/friend/search` - 搜索用户
- `POST /api/chat/v1/friend/request/send` - 发送好友申请
- `POST /api/chat/v1/friend/request/respond` - 处理好友申请
- `GET /api/chat/v1/friend/list` - 获取好友列表
- `GET /api/chat/v1/friend/recommendations` - 获取好友推荐

### 群组接口

- `POST /api/chat/v1/group/create` - 创建群组
- `GET /api/chat/v1/group/list` - 获取群组列表
- `POST /api/chat/v1/group/invite` - 邀请成员
- `POST /api/chat/v1/group/remove-member` - 移除成员
- `POST /api/chat/v1/group/disband` - 解散群组

### 消息接口

- `GET /api/chat/v1/message/list` - 获取聊天列表
- `POST /api/chat/v1/message/search-history` - 搜索聊天记录
- `POST /api/chat/v1/message/recall` - 撤回消息
- `POST /api/chat/v1/message/delete` - 删除消息
- `WS /api/chat/v1/message/chat` - WebSocket 实时聊天

### AI 好友接口

- `GET /api/chat/v1/ai-friend/` - 获取 AI 好友信息
- `POST /api/chat/v1/ai-friend/` - 创建/更新 AI 好友
- `GET /api/chat/v1/ai-friend/history` - 获取对话历史
- `WS /api/chat/v1/ai-friend/chat-stream` - AI 流式对话



## 👥 贡献者
本项目为**DHU软件工程导论课程**大作业，由**21小组**开发完成：

- **LHW** - 项目负责人、架构设计者、前端核心开发
- **YXC** - 后端核心开发（负责认证、消息、好友、群组等模块）
- **WGR** - 数据库设计、AI 相关及工具模块开发

**主要模块分工详情**：

- **前端应用主模块** - LHW、YXC
- **登录认证模块** - LHW、WGR
- **聊天室核心模块** - LHW、YXC
- **API 客户端模块** - LHW
- **后端服务主模块** - YXC、LHW
- **消息业务模块** - YXC、LHW（约 3700 行核心代码）
- **AI 好友业务模块** - WGR、LHW
- **数据库访问模块** - WGR、YXC

---

## 📄 开源协议

本项目遵循 [MIT License](./LICENSE) 协议开源



## 📞 支持与反馈

如有问题或建议，请提交 Issue 或 Pull Request。



## 🔄 更新日志

### v1.0.0

- ✨ 初始版本发布
- ✨ 完成用户认证、好友管理、群组聊天、AI 对话核心功能
- ✨ 支持实时消息推送、文件传输、消息撤回



**注意**: 本项目仍在持续开发中，部分功能可能不完善。欢迎贡献代码和提出建议！

**⭐ 如果您觉得本项目有用，欢迎 Star 支持！**
