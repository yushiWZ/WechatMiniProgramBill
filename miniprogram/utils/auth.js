const api = require('./api');

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          api.post('/api/auth/login', { code: res.code })
            .then(data => {
              wx.setStorageSync('token', data.token);
              wx.setStorageSync('userInfo', data.user);
              resolve(data);
            })
            .catch(reject);
        } else {
          reject(new Error('wx.login 失败'));
        }
      },
      fail: reject
    });
  });
}

module.exports = { login };
