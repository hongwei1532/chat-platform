// 确保环境变量已加载
const fetch = require('node-fetch');
require('dotenv').config();

const { RespServerErr, RespParamErr } = require('../../model/error');
const { RespError, RespData } = require('../../model/resp');

// DeepSeek API 配置
const DEEPSEEK_API_BASE_URL = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''; // 需要从环境变量或配置文件中读取

/**
 * 调用 DeepSeek API 进行聊天（非流式）
 * @param {Array} messages - 消息数组，格式: [{role: 'user', content: '...'}, ...]
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API 响应
 */
async function chatCompletion(messages, options = {}) {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API Key 未配置，请设置环境变量 DEEPSEEK_API_KEY');
    }

    const {
        model = 'deepseek-chat',
        temperature = 0.7,
        max_tokens = 2000,
        stream = false
    } = options;

    try {
        const response = await fetch(`${DEEPSEEK_API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens,
                stream
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`DeepSeek API 错误: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('DeepSeek API 调用失败:', error);
        throw error;
    }
}

/**
 * 流式调用 DeepSeek API
 * @param {Array} messages - 消息数组
 * @param {Object} options - 可选参数
 * @param {Function} onChunk - 接收数据块的回调函数
 * @returns {Promise<void>}
 */
async function chatCompletionStream(messages, options = {}, onChunk) {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API Key 未配置，请设置环境变量 DEEPSEEK_API_KEY');
    }

    const {
        model = 'deepseek-chat',
        temperature = 0.7,
        max_tokens = 2000
    } = options;

    try {
        const response = await fetch(`${DEEPSEEK_API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens,
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`DeepSeek API 错误: ${response.status} - ${errorData}`);
        }

        // node-fetch v2 兼容：使用 Node.js 流而不是 Web Streams API
        const stream = response.body;
        const decoder = new (require('string_decoder').StringDecoder)('utf8');
        let buffer = '';

        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
                buffer += decoder.write(chunk);
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留最后一个不完整的行

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            if (onChunk) onChunk({ done: true });
                            stream.destroy();
                            resolve();
                            return;
                        }
                        try {
                            const json = JSON.parse(data);
                            if (onChunk) onChunk(json);
                        } catch (e) {
                            console.error('解析流数据失败:', e, data);
                        }
                    }
                }
            });

            stream.on('end', () => {
                // 处理剩余的 buffer
                buffer += decoder.end();
                if (buffer.trim()) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                if (onChunk) onChunk({ done: true });
                                resolve();
                                return;
                            }
                            try {
                                const json = JSON.parse(data);
                                if (onChunk) onChunk(json);
                            } catch (e) {
                                console.error('解析流数据失败:', e);
                            }
                        }
                    }
                }
                if (onChunk) onChunk({ done: true });
                resolve();
            });

            stream.on('error', (error) => {
                console.error('流读取错误:', error);
                reject(error);
            });
        });
    } catch (error) {
        console.error('DeepSeek API 流式调用失败:', error);
        throw error;
    }
}

/**
 * 处理聊天请求（非流式）
 */
async function chat(req, res) {
    try {
        const { messages, model, temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return RespError(res, RespParamErr);
        }

        // 验证消息格式
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                return RespError(res, RespParamErr);
            }
        }

        const result = await chatCompletion(messages, {
            model,
            temperature,
            max_tokens
        });

        return RespData(res, result);
    } catch (error) {
        console.error('DeepSeek 聊天处理失败:', error);
        return RespError(res, RespServerErr);
    }
}

/**
 * WebSocket 连接处理流式聊天
 */
async function chatStream(ws, req) {
    try {
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                const { messages, model, temperature, max_tokens } = message;

                if (!messages || !Array.isArray(messages) || messages.length === 0) {
                    ws.send(JSON.stringify({ error: '消息格式错误' }));
                    return;
                }

                // 验证消息格式
                for (const msg of messages) {
                    if (!msg.role || !msg.content) {
                        ws.send(JSON.stringify({ error: '消息格式错误' }));
                        return;
                    }
                }

                // 流式调用 DeepSeek API
                await chatCompletionStream(
                    messages,
                    { model, temperature, max_tokens },
                    (chunk) => {
                        // 将数据块发送给客户端
                        ws.send(JSON.stringify(chunk));
                    }
                );

                // 发送完成标记
                ws.send(JSON.stringify({ done: true }));
            } catch (error) {
                console.error('处理 WebSocket 消息失败:', error);
                ws.send(JSON.stringify({ 
                    error: error.message || '处理消息失败' 
                }));
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket 错误:', error);
        });

        ws.on('close', () => {
            console.log('WebSocket 连接关闭');
        });
    } catch (error) {
        console.error('DeepSeek WebSocket 连接处理失败:', error);
        ws.close();
    }
}

module.exports = {
    chat,
    chatStream,
    chatCompletion,
    chatCompletionStream
};

