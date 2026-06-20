/**
 * ============================================================
 * 智能记账本 - 登录认证路由
 * ============================================================
 *
 * 本文件实现微信小程序的登录认证接口。
 *
 * 【接口列表】
 *   POST /api/auth/login  - 微信小程序登录
 *
 * 【微信登录流程（OAuth 2.0）】
 *   1. 小程序前端调用 wx.login() 获取临时登录凭证 code
 *   2. 前端将 code 发送到本接口的 POST /api/auth/login
 *   3. 后端将 code 转发给微信服务器（jscode2session 接口）
 *   4. 微信服务器返回该用户的 openid（用户唯一标识）
 *   5. 后端根据 openid 查找或创建用户记录
 *   6. 后端签发 JWT Token，前端保存后用于后续请求的认证
 *
 * 【测试模式】
 *   当 config.appId 以 "wx000" 开头时，视为测试号模式。
 *   此时不调用微信服务器接口，而是将前端传入的 code 直接作为 openid，
 *   方便在本地开发环境中调试，无需真实的微信小程序环境。
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const config = require('../config');
const { getDB } = require('../db');

const router = express.Router();

/**
 * POST /api/auth/login
 * 微信小程序登录接口
 *
 * 【请求参数】（JSON Body）
 *   - code: string (必填)
 *     小程序前端通过 wx.login() 获取的临时登录凭证
 *
 * 【响应数据】（JSON）
 *   - token: string
 *     JWT 认证令牌，有效期 7 天，前端需保存在本地存储中
 *   - user: object
 *     用户基本信息 { id, nickname, avatar_url }
 *
 * 【错误码】
 *   - 400: 缺少 code 参数 / 微信登录失败
 *   - 500: 服务器内部错误
 */
router.post('/login', async (req, res) => {
  // 从请求体中提取微信登录凭证 code
  const { code } = req.body;

  // 参数校验：code 是微信登录的必需凭证
  if (!code) {
    return res.status(400).json({ error: '缺少code参数' });
  }

  try {
    let openid;

    // 判断是否为测试号模式
    // 如果 appId 以 "wx000" 开头（即占位值），说明是开发测试环境
    if (config.appId.startsWith('wx000')) {
      // 测试模式：跳过微信服务器调用，直接用 "test_" + code 作为 openid
      // 这样开发者可以在没有真实小程序环境的情况下测试登录流程
      openid = 'test_' + code;
    } else {
      // 正式模式：调用微信 jscode2session 接口，用 code 换取 openid
      // 这是微信官方推荐的登录方式，详见：
      // https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: {
          appid: config.appId,          // 小程序 AppID
          secret: config.appSecret,     // 小程序 AppSecret
          js_code: code,                // 前端获取的临时登录凭证
          grant_type: 'authorization_code' // 授权类型，固定值
        }
      });

      // 检查微信服务器是否返回了错误
      // errcode 存在且非 0 表示请求失败（如 code 无效、AppID/Secret 错误等）
      if (wxRes.data.errcode) {
        return res.status(400).json({ error: '微信登录失败', detail: wxRes.data });
      }

      // 从微信服务器响应中提取 openid
      openid = wxRes.data.openid;
    }

    // ---------- 用户记录管理 ----------

    const db = getDB();

    // 根据 openid 查询数据库中是否已存在该用户
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);

    if (!user) {
      // 新用户：自动注册，插入一条用户记录
      // nickname 和 avatar_url 使用默认空值，后续可通过其他接口更新
      const result = db.prepare('INSERT INTO users (openid) VALUES (?)').run(openid);
      user = { id: result.lastInsertRowid, openid, nickname: '', avatar_url: '' };
    }

    // ---------- 签发 JWT Token ----------

    // 使用 jwt.sign() 生成 Token
    // payload 中包含 userId（数据库主键）和 openid（微信标识）
    // 有效期设置为 7 天（7d），过期后用户需重新登录
    // 签名密钥使用 config.jwtSecret
    const token = jwt.sign({ userId: user.id, openid }, config.jwtSecret, { expiresIn: '7d' });

    // 返回 Token 和用户基本信息
    // 前端保存 token 到本地存储，后续请求通过 Authorization 头携带
    res.json({
      token,
      user: { id: user.id, nickname: user.nickname, avatar_url: user.avatar_url }
    });
  } catch (e) {
    // 捕获所有未预期的异常（如网络请求失败、数据库错误等）
    // 记录错误日志便于排查，但对客户端只返回通用错误信息
    console.error('登录失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
