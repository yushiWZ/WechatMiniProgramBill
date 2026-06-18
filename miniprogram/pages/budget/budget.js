const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    month: util.getCurrentMonth(),
    monthLabel: '',
    amount: '',
    currentSpent: '0.00',
    currentBudget: 0,
    percent: 0
  },

  onShow() {
    this.setData({ monthLabel: util.formatMonthLabel(this.data.month) });
    this.loadData();
  },

  async loadData() {
    try {
      await app.ensureLogin();
      const budgetRes = await api.get('/api/budgets', { month: this.data.month });
      if (budgetRes && budgetRes.budget) {
        this.setData({
          amount: String(budgetRes.budget.amount),
          currentSpent: util.formatAmount(budgetRes.monthExpense || 0),
          currentBudget: budgetRes.budget.amount,
          percent: budgetRes.percentage || 0
        });
      } else {
        // 获取当月支出（无预算时）
        const recordsRes = await api.get('/api/records', { month: this.data.month, type: 'expense' });
        this.setData({
          amount: '',
          currentSpent: util.formatAmount(recordsRes.expenseTotal || 0),
          currentBudget: 0,
          percent: 0
        });
      }
    } catch (e) {
      console.error('加载预算数据失败:', e);
    }
  },

  onMonthChange(e) {
    const month = e.detail.value;
    this.setData({ month, monthLabel: util.formatMonthLabel(month) });
    this.loadData();
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  async onSave() {
    const amount = parseFloat(this.data.amount);
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    try {
      await app.ensureLogin();
      await api.post('/api/budgets', { month: this.data.month, amount });
      wx.showToast({ title: '预算已保存', icon: 'success' });
      this.loadData();
    } catch (e) {
      console.error('保存预算失败:', e);
    }
  }
});
