/**
 * 首页（记账主页）- index.js
 *
 * 功能概述：
 *   本页面是小程序的主记账页面，展示用户当月的收支汇总信息、
 *   月度预算使用进度，以及按日期分组的收支记录列表。
 *   用户可通过右下角的浮动按钮（FAB）跳转到新增记录页面进行记账，
 *   也可以点击列表中的某条记录进行编辑。
 *
 * 数据流向：
 *   页面 onShow → loadData() → 并发请求记录列表和预算数据 → setData 渲染页面
 */

// 引入后端 API 请求封装模块
const api = require('../../utils/api');
// 引入通用工具函数（格式化金额、日期分组等）
const util = require('../../utils/util');
// 获取全局 App 实例，用于登录态管理
const app = getApp();

Page({
  /**
   * data - 页面响应式数据
   *
   * incomeTotal   {string}  本月收入总额，格式化为 '0.00' 形式，用于页面展示
   * expenseTotal  {string}  本月支出总额，格式化为 '0.00' 形式
   * balance       {string}  本月结余（收入 - 支出），可为负数
   * budget        {number}  用户设定的月度预算金额（元），0 表示未设置预算
   * budgetPercent {number}  预算使用百分比（0~100+），超过100表示已超预算
   * groups        {Array}   按日期分组的记录列表，结构为：
   *                 [{ dateLabel: '今天 (06/20)', records: [{ id, category_icon, category_name, note, type, amount, ... }] }]
   * currentMonth  {string}  当前查询的月份，格式 'YYYY-MM'，默认取当月
   */
  data: {
    incomeTotal: '0.00',
    expenseTotal: '0.00',
    balance: '0.00',
    budget: 0,
    budgetPercent: 0,
    groups: [],
    currentMonth: util.getCurrentMonth()
  },

  /**
   * onShow - 页面显示时触发（生命周期回调）
   *
   * 1. 设置自定义 TabBar 的选中状态为第 0 项（首页）
   * 2. 每次页面显示时重新加载数据（保证数据时效性）
   */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadData();
  },

  /**
   * onPullDownRefresh - 下拉刷新事件处理（生命周期回调）
   *
   * 用户下拉页面时重新加载数据，加载完成后停止下拉刷新动画
   */
  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  /**
   * loadData - 加载页面核心数据（异步方法）
   *
   * 执行流程：
   *   1. 确保用户已登录（未登录时自动触发登录流程）
   *   2. 并发请求两个接口：
   *      - GET /api/records   获取当月收支记录列表（最多100条）
   *      - GET /api/budgets   获取当月预算设置
   *   3. 计算并格式化收入、支出、结余金额
   *   4. 解析预算金额和使用百分比
   *   5. 将记录列表按日期分组
   *   6. 通过 setData 更新页面数据
   *
   * 异常处理：
   *   - 若因未登录导致请求失败，自动登录后重试加载
   */
  async loadData() {
    try {
      // 确保登录态有效，未登录时会等待登录完成
      await app.ensureLogin();
      const month = this.data.currentMonth;

      // 并发请求记录列表和预算信息，提升加载速度
      const [recordsRes, budgetRes] = await Promise.all([
        api.get('/api/records', { month, pageSize: 100 }),
        api.get('/api/budgets', { month })
      ]);

      // 格式化金额：统一保留两位小数
      const incomeTotal = util.formatAmount(recordsRes.incomeTotal || 0);
      const expenseTotal = util.formatAmount(recordsRes.expenseTotal || 0);
      const balance = util.formatAmount(parseFloat(incomeTotal) - parseFloat(expenseTotal));

      // 解析预算数据
      let budget = 0;
      let budgetPercent = 0;
      if (budgetRes) {
        budget = parseFloat(budgetRes.budget.amount);
        budgetPercent = budgetRes.percentage || 0;
      }

      // 将记录列表按日期分组，生成 groups 数组用于页面渲染
      const groups = util.groupByDate(recordsRes.list || []);

      // 批量更新页面数据
      this.setData({
        incomeTotal,
        expenseTotal,
        balance,
        budget,
        budgetPercent,
        groups
      });
    } catch (e) {
      console.error('加载数据失败:', e);
      // 首次加载若未登录，自动登录后重试
      if (e.message === '未登录') {
        app.login().then(() => this.loadData());
      }
    }
  },

  /**
   * onAddRecord - 点击浮动"+"按钮，跳转到新增记账页面
   */
  onAddRecord() {
    wx.navigateTo({ url: '/pages/add-record/add-record' });
  },

  /**
   * onRecordTap - 点击某条记录，跳转到编辑页面
   *
   * @param {Object} e - 事件对象，通过 e.currentTarget.dataset.id 获取被点击记录的 ID
   */
  onRecordTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/add-record/add-record?id=${id}` });
  }
});
