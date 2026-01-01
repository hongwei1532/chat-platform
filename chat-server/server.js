const app = require('./src/app');
require('./src/db/db'); // 初始化数据库

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 监听所有网络接口，允许局域网访问
const DISPLAY_IP = process.env.DISPLAY_IP; // 可选：指定要显示的IP地址

app.listen(PORT, HOST, () => {
  const localIP = DISPLAY_IP || getLocalIP();
  console.log(`聊天平台后端服务启动，端口 ${PORT}`);
  console.log(`监听地址: ${HOST}:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`局域网访问: http://${localIP}:${PORT}/health`);
  if (DISPLAY_IP) {
    console.log(`提示: 使用环境变量 DISPLAY_IP=${DISPLAY_IP} 指定的IP地址`);
  }
});

// 获取本机局域网IP地址
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ipList = [];
  
  // 收集所有非内部的IPv4地址
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipList.push(iface.address);
      }
    }
  }
  
  if (ipList.length === 0) {
    return 'localhost';
  }
  
  // 优先选择 192.168.3.x 网段的IP（常见的内网网段）
  const preferredIP = ipList.find(ip => ip.startsWith('192.168.3.'));
  if (preferredIP) {
    return preferredIP;
  }
  
  // 其次选择其他 192.168.x.x 网段的IP
  const localIP = ipList.find(ip => ip.startsWith('192.168.'));
  if (localIP) {
    return localIP;
  }
  
  // 再次选择 172.20.x.x 网段的IP
  const preferred172IP = ipList.find(ip => ip.startsWith('172.20.'));
  if (preferred172IP) {
    return preferred172IP;
  }
  
  // 最后选择 10.x.x.x 网段的IP
  const privateIP = ipList.find(ip => ip.startsWith('10.'));
  if (privateIP) {
    return privateIP;
  }
  
  // 如果都没有，返回第一个找到的IP
  return ipList[0];
}
