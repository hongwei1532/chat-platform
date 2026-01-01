const fs = require('fs');

/**
 * 随机生成字符串
 */
function generateRandomString(length) {
    let result = '';
    const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * 生成8-10位随机数字（群id）
 */
function generateGroupCode() {
    const length = Math.floor(Math.random() * 3) + 8; // 8-10位
    let result = '';
    const digits = '0123456789';
    for (let i = 0; i < length; i++) {
        result += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return result;
}

/**
 * 判断指定目录是否存在,不存在则创建
 */
function notExitCreate(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

module.exports = {
    generateRandomString,
    generateGroupCode,
    notExitCreate
};

