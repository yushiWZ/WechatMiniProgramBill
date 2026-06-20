/**
 * auth.js - 登录认证模块
 *
 * 本模块封装微信小程序的登录流程，实现"微信静默登录"：
 * 1. 调用 wx.login() 获取临时登录凭证 code
 * 2. 将 code 发送到后端服务器，后端凭 code 换取 openId 等信息
 * 3. 后端返回 JWT Token 和用户信息
 * 4. 将 Token 和用户信息持久化到本地缓存，供后续请求使用
 *
 * 依赖：api.js（HTTP 请求模块）
 */

// 引入封装好的 HTTP 请求模块，用于向后端发送登录请求
const api = require('./api');

/**
 * 执行微信登录流程
 *
 * 完整流程：
 *   wx.login() → 获取 code → POST /api/auth/login → 存储 token & userInfo
 *
 * @returns {Promise<{token: string, user: object}>}
 *   - token：JWT 令牌字符串，后续请求会携带在 Authorization 头中
 *   - user：用户信息对象（通常包含昵称、头像等）
 *
 * @throws {Error} 当 wx.login 失败或网络请求失败时 reject
 */
function login() {
  return new Promise((resolve, reject) => {
    // 第一步：调用微信登录 API 获取临时 code
    wx.login({
      success(res) {
        // 检查是否成功获取到 code
        if (res.code) {
          // 第二步：将 code 发送给后端，后端会用 code 换取用户身份信息
          api.post('/api/auth/login', { code: res.code })
            .then(data => {
              // 第三步：将后端返回的 Token 和用户信息存储到本地缓存
              // 使用 StorageSync（同步方式）确保后续请求能立即读取到
              wx.setStorageSync('token', data.token);
              wx.setStorageSync('userInfo', data.user);
              // 登录成功，将完整响应数据返回给调用方
              resolve(data);
            })
            .catch(reject);
        } else {
          // wx.login 调用成功但未返回 code，属于异常情况
          reject(new Error('wx.login 失败'));
        }
      },
      // wx.login 本身调用失败（如微信客户端异常），直接 reject
      fail: reject
    });
  });
}

// 导出登录方法供页面（如我的页面、启动页）调用
module.exports = { login };
