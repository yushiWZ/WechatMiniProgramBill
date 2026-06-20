/**
 * ============================================================
 * 预算设置页面 (budget)
 * ============================================================
 *
 * 功能概述：
 *   本页面用于设置和管理用户的月度预算。
 *   用户可以选择月份、输入预算金额，页面会自动计算并展示：
 *     - 当月已支出金额
 *     - 预算使用百分比（进度条可视化）
 *     - 超支预警（使用率超过 80% 时进度条变为红色）
 *
 * 数据流：
 *   1. onShow 时加载当前月份的预算数据和支出统计
 *   2. loadData 分两种情况处理：
 *      a) 该月有预算 → 直接显示预算金额、已支出、使用百分比
 *      b) 该月无预算 → 仅显示已支出金额，预算相关字段清零
 *   3. 用户切换月份后自动重新加载对应月份数据
 *   4. 用户输入预算金额后点击保存，POST 到后端（幂等更新）
 *
 * 依赖：
 *   - api.js  —— 封装的 HTTP 请求工具
 *   - util.js —— getCurrentMonth()、formatMonthLabel()、formatAmount() 等工具函数
 *   - app.js  —— 全局 App 实例，提供 ensureLogin() 确保登录态
 */

const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

Page({
  /**
   * data 字段说明：
   *
   * month         {String}  - 当前选中的月份，格式 'YYYY-MM'，默认为当前月份
   * monthLabel    {String}  - 月份的展示文本（如"2026年6月"），由 util.formatMonthLabel 生成
   * amount        {String}  - 用户在输入框中填写的预算金额（字符串形式）
   * currentSpent  {String}  - 当月已支出金额（格式化后的字符串，如"1,234.56"）
   * currentBudget {Number}  - 当月已设定的预算金额数值，无预算时为 0
   * percent       {Number}  - 预算使用百分比（0-100+），超过 100 表示已超支
   */
  data: {
    month: util.getCurrentMonth(),
    monthLabel: '',
    amount: '',
    currentSpent: '0.00',
    currentBudget: 0,
    percent: 0
  },

  /**
   * 生命周期 - 页面显示时触发
   *
   * 每次页面显示时：
   *   1. 生成月份的展示文本（monthLabel）
   *   2. 加载该月份的预算和支出数据
   */
  onShow() {
    this.setData({ monthLabel: util.formatMonthLabel(this.data.month) });
    this.loadData();
  },

  /**
   * 加载预算和支出数据
   *
   * 核心方法，根据当前选中月份请求后端数据：
   *
   * 情况1 - 该月已有预算（budgetRes.budget 存在）：
   *   - amount       ← 已设定的预算金额（回填到输入框）
   *   - currentSpent ← 该月实际支出金额（格式化显示）
   *   - currentBudget ← 预算金额数值（用于控制进度条是否显示）
   *   - percent      ← 使用百分比（用于进度条宽度和超支预警）
   *
   * 情况2 - 该月尚无预算（budgetRes.budget 不存在）：
   *   - 单独请求该月的支出记录，仅获取支出总额
   *   - 预算相关字段清零，进度条区域不显示
   */
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
        // 该月尚未设定预算，单独查询当月支出总额用于展示
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

  /**
   * 月份选择变更
   *
   * 通过微信原生 picker（mode="date" fields="month"）触发。
   * 更新 month 和 monthLabel 后，重新加载对应月份的数据。
   */
  onMonthChange(e) {
    const month = e.detail.value;
    this.setData({ month, monthLabel: util.formatMonthLabel(month) });
    this.loadData();
  },

  /**
   * 预算金额输入事件
   *
   * 每次输入变化时实时同步到 amount 字段。
   */
  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  /**
   * 保存预算
   *
   * 逻辑：
   *   1. 将输入金额转为浮点数，校验有效性（必须 > 0）
   *   2. 确保用户已登录
   *   3. POST /api/budgets 提交预算数据（月份 + 金额）
   *      后端采用幂等设计：同一月份重复提交会覆盖更新
   *   4. 成功后显示 Toast 提示并刷新数据（更新进度条等）
   */
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
