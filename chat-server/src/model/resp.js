let { RespMap } = require('./error')

function respHttp(res, respCode, data) {
    let resp = {
        code: 200,
        data: "",
        message: "success",
    }
    if (respCode != 200) {
        if (typeof respCode === 'object' && respCode !== null) {
            const customCode = respCode.code || 5000
            resp.code = customCode
            resp.message = respCode.message || RespMap[customCode] || 'error'
        } else {
            resp.code = respCode
            resp.message = RespMap[respCode] || 'error'
        }
    } else {
        resp.data = data
    }
    res.json(resp)
}

function RespSuccess(res) {
    respHttp(res, 200)
}

function RespError(res, respCode) {
    respHttp(res, respCode)
}

function RespData(res, data) {
    respHttp(res, 200, data)
}

module.exports = {
    RespSuccess,
    RespError,
    RespData
}

