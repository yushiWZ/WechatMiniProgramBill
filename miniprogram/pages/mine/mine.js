/**
 * 我的页（个人中心）- mine.js
 *
 * 功能概述：
 *   本页面是用户的个人中心，展示用户基本信息和快捷入口。
 *   主要功能包括：
 *   - 显示用户头像和昵称（未登录时显示"点击登录"）
 *   - 点击用户卡片触发微信一键登录
 *   - 跳转到分类管理页面
 *   - 跳转到预算设置页面
 *   - 显示记账总记录数
 *
 * 数据流向：
 *   页面 onShow → loadUserInfo()（读取本地缓存/全局数据）
 *              → loadRecordCount()（请求接口获取记录总数）
 */

// 引入后端 API 请求封装模块
const api = require('../../utils/api');
// 获取全局 App 实例，用于登录态和用户信息管理
const app = getApp();

Page({
  /**
   * data - 页面响应式数据
   *
   * nickname      {string}  用户昵称，未登录时为空字符串
   * avatarUrl     {string}  用户头像 URL，为空时显示默认占位图标
   * totalRecords  {number}  用户的记账总记录数
   */
  data: {
    nickname: '',
    avatarUrl: '',
    totalRecords: 0
  },

  /**
   * onShow - 页面显示时触发（生命周期回调）
   *
   * 1. 设置自定义 TabBar 的选中状态为第 2 项（我的页）
   * 2. 加载用户信息（从全局数据或本地缓存读取）
   * 3. 加载记账记录总数（通过接口请求）
   */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadUserInfo();
    this.loadRecordCount();
  },

  /**
   * loadUserInfo - 加载用户基本信息
   *
   * 优先从全局变量 app.globalData.userInfo 读取，
   * 若不存在则从本地缓存 wx.getStorageSync('userInfo') 读取。
   * 将昵称和头像 URL 设置到页面数据中。
   * 若昵称为空则默认显示"微信用户"。
   */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        nickname: userInfo.nickname || '微信用户',
        avatarUrl: userInfo.avatar_url || ''
      });
    }
  },

  /**
   * loadRecordCount - 加载记账记录总数（异步方法）
   *
   * 通过请求 /api/records 接口（pageSize=1，仅获取 total 字段）
   * 来获取用户的记账记录总数，避免拉取全量数据。
   */
  async loadRecordCount() {
    try {
      await app.ensureLogin();
      // 仅请求1条记录，目的是获取返回结果中的 total 字段
      const res = await api.get('/api/records', { pageSize: 1 });
      this.setData({ totalRecords: res.total || 0 });
    } catch (e) {
      console.error('加载记录数失败:', e);
    }
  },

  /**
   * onLogin - 用户点击头像区域时触发登录
   *
   * 如果已登录（token 存在）则直接返回，不重复登录。
   * 登录流程：
   *   1. 显示"登录中..."加载提示
   *   2. 调用 app.login() 执行登录
   *   3. 登录成功后刷新用户信息，显示成功提示
   *   4. 登录失败则显示失败提示
   */
  async onLogin() {
    // 已登录则跳过
    if (app.globalData.token) return;

    wx.showLoading({ title: '登录中...' });
    try {
      await app.login();
      // 登录成功后重新加载用户信息
      this.loadUserInfo();
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  /**
   * onGoCategory - 跳转到分类管理页面
   */
  onGoCategory() {
    wx.navigateTo({ url: '/pages/category/category' });
  },

  /**
   * onGoBudget - 跳转到预算设置页面
   */
  onGoBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' });
  }
});
