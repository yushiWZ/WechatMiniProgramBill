/**
 * api.js - HTTP 请求封装模块
 *
 * 本模块对微信小程序的 wx.request 进行统一封装，提供以下能力：
 * 1. 自动携带 JWT Token（Bearer 认证），从本地缓存中读取
 * 2. 统一处理 HTTP 状态码：
 *    - 2xx：请求成功，返回 data
 *    - 401：Token 过期或无效，自动清除登录状态并提示用户重新登录
 *    - 其他：显示后端返回的错误信息
 * 3. 统一处理网络异常（fail 回调）
 * 4. 导出 GET / POST / PUT / DELETE 四个便捷方法供页面调用
 *
 * 依赖：wx（微信小程序全局对象）、getApp()（获取应用实例）
 */

// 后端服务基础地址，所有请求 URL 都会拼接此前缀
const BASE_URL = 'http://localhost:3000';

/**
 * 通用 HTTP 请求函数（内部使用，不直接对外导出）
 *
 * @param {string} url    - 请求路径（不含域名，如 '/api/bills'）
 * @param {string} method - HTTP 方法，默认 'GET'
 * @param {object} data   - 请求体/查询参数，默认空对象
 * @returns {Promise<object>} 成功时 resolve 后端返回的 JSON 数据，失败时 reject Error 对象
 */
function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    // 从本地缓存同步读取 JWT Token
    const token = wx.getStorageSync('token');

    // 构建请求头，统一使用 JSON 格式
    const header = {
      'Content-Type': 'application/json'
    };

    // 如果存在 Token，则在请求头中添加 Bearer 认证信息
    // 格式：Authorization: Bearer <token>
    if (token) {
      header['Authorization'] = 'Bearer ' + token;
    }

    // 调用微信小程序原生网络请求 API
    wx.request({
      url: BASE_URL + url,  // 拼接完整请求地址
      method,
      data,
      header,

      /**
       * 请求成功回调（HTTP 层面成功，即收到了服务器响应）
       * 注意：这里的 "成功" 不代表业务层面成功，需要根据 statusCode 进一步判断
       */
      success(res) {
        // ---- 401 未授权处理 ----
        // Token 已过期或无效，需要清除所有登录态并引导用户重新登录
        if (res.statusCode === 401) {
          // 清除本地缓存中的登录凭证
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          // 同步清除 App 全局数据中的登录信息
          getApp().globalData.token = null;
          getApp().globalData.userInfo = null;
          // 弹出轻提示告知用户
          wx.showToast({ title: '请重新登录', icon: 'none' });
          // 以 Error 形式 reject，调用方可在 catch 中处理
          reject(new Error('未登录'));
          return;
        }

        // ---- 2xx 成功响应 ----
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          // ---- 其他错误状态码（如 400、403、500 等） ----
          // 优先取后端返回的 error 字段作为提示文案，兜底使用默认文案
          const msg = (res.data && res.data.error) || '请求失败';
          wx.showToast({ title: msg, icon: 'none' });
          reject(new Error(msg));
        }
      },

      /**
       * 请求失败回调（网络层面的失败，如断网、DNS 解析失败等）
       */
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' });
        reject(err);
      }
    });
  });
}

/**
 * 导出四个常用 HTTP 方法的便捷封装
 * 使用示例：
 *   const api = require('../../utils/api');
 *   api.get('/api/bills', { month: '2026-06' }).then(data => { ... });
 *   api.post('/api/bills', { amount: 100, category: '餐饮' }).then(data => { ... });
 */
module.exports = {
  get: (url, data) => request(url, 'GET', data),
  post: (url, data) => request(url, 'POST', data),
  put: (url, data) => request(url, 'PUT', data),
  delete: (url, data) => request(url, 'DELETE', data)
};
