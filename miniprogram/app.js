const auth = require('./utils/auth');

App({
  globalData: {
    userInfo: null,
    token: null
  },

  onLaunch() {
    // 尝试恢复登录状态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
  },

  // 执行登录
  async login() {
    try {
      const { token, user } = await auth.login();
      this.globalData.token = token;
      this.globalData.userInfo = user;
      return user;
    } catch (e) {
      console.error('登录失败:', e);
      throw e;
    }
  },

  // 确保已登录
  async ensureLogin() {
    if (this.globalData.token) return this.globalData.userInfo;
    return this.login();
  }
});
