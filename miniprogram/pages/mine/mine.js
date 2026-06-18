const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    totalRecords: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadUserInfo();
    this.loadRecordCount();
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        nickname: userInfo.nickname || '微信用户',
        avatarUrl: userInfo.avatar_url || ''
      });
    }
  },

  async loadRecordCount() {
    try {
      await app.ensureLogin();
      const res = await api.get('/api/records', { pageSize: 1 });
      this.setData({ totalRecords: res.total || 0 });
    } catch (e) {
      console.error('加载记录数失败:', e);
    }
  },

  async onLogin() {
    if (app.globalData.token) return;

    wx.showLoading({ title: '登录中...' });
    try {
      await app.login();
      this.loadUserInfo();
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  onGoCategory() {
    wx.navigateTo({ url: '/pages/category/category' });
  },

  onGoBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' });
  }
});
