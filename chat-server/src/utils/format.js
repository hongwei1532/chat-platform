//文件大小转换
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

// 解析文件大小字符串转换为字节数
function parseFileSize(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') {
        return 0;
    }
    
    // 如果已经是数字，直接返回
    if (typeof sizeStr === 'number' || /^\d+$/.test(sizeStr.trim())) {
        return parseInt(sizeStr) || 0;
    }
    
    // 解析格式化字符串，如 "194.23KB", "1.5MB" 等
    const match = sizeStr.trim().match(/^([\d.]+)\s*(Bytes|KB|MB|GB|TB|PB|EB|ZB|YB)?$/i);
    if (!match) {
        return 0;
    }
    
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'Bytes').toUpperCase();
    
    const k = 1024;
    const units = {
        'BYTES': 0,
        'KB': 1,
        'MB': 2,
        'GB': 3,
        'TB': 4,
        'PB': 5,
        'EB': 6,
        'ZB': 7,
        'YB': 8
    };
    
    const power = units[unit] || 0;
    return Math.round(value * Math.pow(k, power));
}

//时间转换
function formatDate(timestamp) {
    const utcDate = new Date(timestamp);
    return utcDate.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium", hourCycle: "h24" });
}

module.exports = {
    formatBytes,
    parseFileSize,
    formatDate
};

