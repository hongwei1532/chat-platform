// 邮件发送服务
const nodemailer = require('nodemailer');
require('dotenv').config();

// 创建邮件传输器
// 支持多种邮件服务商：Gmail, QQ邮箱, 163邮箱等
function createTransporter() {
  // 从环境变量读取配置，如果没有则使用默认配置
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.qq.com', // QQ邮箱SMTP服务器
    port: port,
    secure: port === 465, // 465端口使用SSL，其他端口使用TLS
    auth: {
      user: process.env.EMAIL_USER || '', // 发送邮件的邮箱
      pass: process.env.EMAIL_PASS || '' // 邮箱授权码（不是密码）
    }
  };

  // 如果没有配置邮箱，返回null
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('邮件服务未配置，请在.env文件中设置EMAIL_USER和EMAIL_PASS');
    return null;
  }

  return nodemailer.createTransport(emailConfig);
}

/**
 * 发送验证码邮件
 * @param {string} to - 接收邮箱
 * @param {string} code - 验证码
 * @returns {Promise<boolean>} - 是否发送成功
 */
async function sendVerificationCode(to, code) {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.error('邮件服务未配置，无法发送验证码');
    return false;
  }

  const mailOptions = {
    from: `"聊天平台" <${process.env.EMAIL_USER || 'noreply@example.com'}>`,
    to: to,
    subject: '【聊天平台】邮箱验证码',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #409eff;">邮箱验证码</h2>
        <p>您好！</p>
        <p>您正在注册/登录聊天平台，验证码为：</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #409eff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>验证码有效期为 <strong>10分钟</strong>，请勿泄露给他人。</p>
        <p>如果这不是您的操作，请忽略此邮件。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('验证码邮件发送成功:', info.messageId);
    return true;
  } catch (error) {
    console.error('发送验证码邮件失败:', error);
    return false;
  }
}

module.exports = {
  sendVerificationCode
};

