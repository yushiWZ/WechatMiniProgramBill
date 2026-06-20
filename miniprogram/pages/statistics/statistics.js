/**
 * 统计页 - statistics.js
 *
 * 功能概述：
 *   本页面用于展示用户的收支统计分析数据，包括：
 *   - 指定月份的收支汇总（收入、支出、结余）
 *   - 分类支出占比（简易饼图图例 + 横向占比条）
 *   - 近6个月的收支趋势（柱状图）
 *   用户可通过顶部左右箭头切换查看不同月份的数据。
 *
 * 数据流向：
 *   页面 onShow → loadData() → 并发请求分类饼图接口和月度趋势接口 → 计算柱高 → setData 渲染
 */

// 引入后端 API 请求封装模块
const api = require('../../utils/api');
// 引入通用工具函数（格式化金额、月份切换等）
const util = require('../../utils/util');
// 获取全局 App 实例
const app = getApp();

// 饼图/占比条的配色方案，共9种颜色，按顺序分配给不同分类
const PIE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#95a5a6', '#34495e'];

Page({
  /**
   * data - 页面响应式数据
   *
   * currentMonth  {string}  当前查询的月份，格式 'YYYY-MM'，默认取当月
   * monthLabel    {string}  用于页面显示的月份标签，如 '2026年6月'
   * incomeTotal   {string}  当月收入总额，格式化字符串
   * expenseTotal  {string}  当月支出总额，格式化字符串
   * balance       {string}  当月结余（收入 - 支出）
   * pieData       {Array}   分类支出数据数组，每项包含：
   *                 { categoryName: '餐饮', totalAmount: 500, percentage: 35.2, type: 'expense' }
   * pieColors     {Array}   饼图配色数组，与 pieData 索引一一对应
   * trendData     {Array}   近6个月趋势数据数组，每项包含：
   *                 { month: '2026-01', monthShort: '01', income: 5000, expense: 3000,
   *                   incomeHeight: 160, expenseHeight: 96 }
   */
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

  /**
   * onShow - 页面显示时触发（生命周期回调）
   *
   * 1. 设置自定义 TabBar 的选中状态为第 1 项（统计页）
   * 2. 格式化月份标签用于显示
   * 3. 加载统计数据
   */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.setData({ monthLabel: util.formatMonthLabel(this.data.currentMonth) });
    this.loadData();
  },

  /**
   * loadData - 加载统计分析数据（异步方法）
   *
   * 执行流程：
   *   1. 确保用户已登录
   *   2. 并发请求两个接口：
   *      - GET /api/statistics/category-pie   获取分类汇总数据（含收入和支出）
   *      - GET /api/statistics/monthly-trend  获取近6个月收支趋势数据
   *   3. 过滤出支出数据作为饼图数据源（pieData）
   *   4. 分别计算收入和支出总额，并算出结余
   *   5. 计算柱状图每根柱子的高度（以 rpx 为单位）：
   *      - 找到所有月份中收入/支出的最大值作为基准
   *      - 按比例缩放到最大 200rpx 高度，最小高度 4rpx
   *   6. 通过 setData 更新页面
   */
  async loadData() {
    try {
      await app.ensureLogin();
      const month = this.data.currentMonth;

      // 并发请求：分类饼图数据 + 月度趋势数据
      const [pieRes, trendRes] = await Promise.all([
        api.get('/api/statistics/category-pie', { month }),
        api.get('/api/statistics/monthly-trend', { months: 6 })
      ]);

      // 过滤出支出类型的分类数据，用于饼图展示
      const pieData = (pieRes.list || []).filter(item => item.type === 'expense');

      // 从饼图接口返回的全量数据中分别汇总收入和支出总额
      const incomeTotal = util.formatAmount(
        (pieRes.list || []).filter(i => i.type === 'income').reduce((s, i) => s + i.totalAmount, 0)
      );
      const expenseTotal = util.formatAmount(
        pieData.reduce((s, i) => s + i.totalAmount, 0)
      );
      const balance = util.formatAmount(parseFloat(incomeTotal) - parseFloat(expenseTotal));

      // ---- 柱状图高度计算 ----
      // 找出所有月份中收入或支出的最大值，作为高度计算基准（最小为1避免除零）
      const maxAmount = Math.max(
        ...(trendRes.list || []).map(i => Math.max(i.income || 0, i.expense || 0)),
        1
      );
      const barMaxHeight = 200;              // rpx，柱子最大高度（对应 CSS 中 .bars 容器 240rpx）
      // 将每个月的收入/支出金额按比例转换为柱子高度（rpx），最小4rpx保证可见
      const trendData = (trendRes.list || []).map(item => ({
        month: item.month,
        monthShort: item.month.substring(5), // 截取 'MM' 部分用于横轴标签
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

  /**
   * onPrevMonth - 切换到上一个月
   *
   * 通过 util.changeMonth 计算前一个月的月份值，
   * 更新 currentMonth 和 monthLabel 后重新加载数据
   */
  onPrevMonth() {
    const newMonth = util.changeMonth(this.data.currentMonth, -1);
    this.setData({ currentMonth: newMonth, monthLabel: util.formatMonthLabel(newMonth) });
    this.loadData();
  },

  /**
   * onNextMonth - 切换到下一个月
   *
   * 通过 util.changeMonth 计算下一个月的月份值，
   * 更新 currentMonth 和 monthLabel 后重新加载数据
   */
  onNextMonth() {
    const newMonth = util.changeMonth(this.data.currentMonth, 1);
    this.setData({ currentMonth: newMonth, monthLabel: util.formatMonthLabel(newMonth) });
    this.loadData();
  }
});
