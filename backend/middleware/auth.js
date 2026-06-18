const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.userId;
    req.openid = payload.openid;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = auth;
