const db = require("./db.js")

function Query(sql, info) {
    return new Promise((resolve, reject) => {
        db.query(sql, info, async (err, results) => {
            if (err) {
                console.log('SQL执行错误:', err);
            }
            resolve({ err, results })
        })
    })
}

module.exports = {
    Query
}

