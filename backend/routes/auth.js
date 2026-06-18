const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const config = require('../config');
const { getDB } = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: '缺少code参数' });
  }

  try {
    let openid;

    // 如果是测试号（appId 为占位值），直接用 code 作为 openid 模拟登录
    if (config.appId.startsWith('wx000')) {
      openid = 'test_' + code;
    } else {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: {
          appid: config.appId,
          secret: config.appSecret,
          js_code: code,
          grant_type: 'authorization_code'
        }
      });
      if (wxRes.data.errcode) {
        return res.status(400).json({ error: '微信登录失败', detail: wxRes.data });
      }
      openid = wxRes.data.openid;
    }

    const db = getDB();
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const result = db.prepare('INSERT INTO users (openid) VALUES (?)').run(openid);
      user = { id: result.lastInsertRowid, openid, nickname: '', avatar_url: '' };
    }

    const token = jwt.sign({ userId: user.id, openid }, config.jwtSecret, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, nickname: user.nickname, avatar_url: user.avatar_url }
    });
  } catch (e) {
    console.error('登录失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
