const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    incomeTotal: '0.00',
    expenseTotal: '0.00',
    balance: '0.00',
    budget: 0,
    budgetPercent: 0,
    groups: [],
    currentMonth: util.getCurrentMonth()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    try {
      await app.ensureLogin();
      const month = this.data.currentMonth;
      const [recordsRes, budgetRes] = await Promise.all([
        api.get('/api/records', { month, pageSize: 100 }),
        api.get('/api/budgets', { month })
      ]);

      const incomeTotal = util.formatAmount(recordsRes.incomeTotal || 0);
      const expenseTotal = util.formatAmount(recordsRes.expenseTotal || 0);
      const balance = util.formatAmount(parseFloat(incomeTotal) - parseFloat(expenseTotal));

      let budget = 0;
      let budgetPercent = 0;
      if (budgetRes) {
        budget = parseFloat(budgetRes.budget.amount);
        budgetPercent = budgetRes.percentage || 0;
      }

      const groups = util.groupByDate(recordsRes.list || []);

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

  onAddRecord() {
    wx.navigateTo({ url: '/pages/add-record/add-record' });
  },

  onRecordTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/add-record/add-record?id=${id}` });
  }
});
