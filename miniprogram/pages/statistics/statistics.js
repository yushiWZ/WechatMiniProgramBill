const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

const PIE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#95a5a6', '#34495e'];

Page({
  data: {
    currentMonth: util.getCurrentMonth(),
    monthLabel: '',
    incomeTotal: '0.00',
    expenseTotal: '0.00',
    balance: '0.00',
    pieData: [],
    pieColors: PIE_COLORS,
    trendData: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.setData({ monthLabel: util.formatMonthLabel(this.data.currentMonth) });
    this.loadData();
  },

  async loadData() {
    try {
      await app.ensureLogin();
      const month = this.data.currentMonth;
      const [pieRes, trendRes] = await Promise.all([
        api.get('/api/statistics/category-pie', { month }),
        api.get('/api/statistics/monthly-trend', { months: 6 })
      ]);

      // 过滤支出数据
      const pieData = (pieRes.list || []).filter(item => item.type === 'expense');

      const incomeTotal = util.formatAmount(
        (pieRes.list || []).filter(i => i.type === 'income').reduce((s, i) => s + i.totalAmount, 0)
      );
      const expenseTotal = util.formatAmount(
        pieData.reduce((s, i) => s + i.totalAmount, 0)
      );
      const balance = util.formatAmount(parseFloat(incomeTotal) - parseFloat(expenseTotal));

      // 柱状图数据
      const maxAmount = Math.max(
        ...(trendRes.list || []).map(i => Math.max(i.income || 0, i.expense || 0)),
        1
      );
      const barMaxHeight = 200;              // rpx，对应 CSS 中 .bars 容器 240rpx
      const trendData = (trendRes.list || []).map(item => ({
        month: item.month,
        monthShort: item.month.substring(5), // MM
        income: item.income,
        expense: item.expense,
        incomeHeight: Math.max(Math.round((item.income / maxAmount) * barMaxHeight), 4),
        expenseHeight: Math.max(Math.round((item.expense / maxAmount) * barMaxHeight), 4)
      }));

      this.setData({ pieData, incomeTotal, expenseTotal, balance, trendData });
    } catch (e) {
      console.error('加载统计数据失败:', e);
    }
  },

  onPrevMonth() {
    const newMonth = util.changeMonth(this.data.currentMonth, -1);
    this.setData({ currentMonth: newMonth, monthLabel: util.formatMonthLabel(newMonth) });
    this.loadData();
  },

  onNextMonth() {
    const newMonth = util.changeMonth(this.data.currentMonth, 1);
    this.setData({ currentMonth: newMonth, monthLabel: util.formatMonthLabel(newMonth) });
    this.loadData();
  }
});
