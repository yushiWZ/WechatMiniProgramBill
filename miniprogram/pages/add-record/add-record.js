/**
 * ============================================================
 * 添加/编辑记录页面 (add-record)
 * ============================================================
 *
 * 功能概述：
 *   本页面用于新增或编辑一条账单记录（支出/收入）。
 *   页面复用了同一套表单，通过 URL 参数 id 区分「新增模式」和「编辑模式」：
 *     - 无 id → 新增模式：用户填写分类、金额、日期、备注后提交
 *     - 有 id → 编辑模式：先加载已有记录数据到表单，修改后提交更新
 *
 * 数据流：
 *   1. onLoad 时判断是否编辑模式，按需加载记录详情
 *   2. 始终加载当前收支类型对应的分类列表
 *   3. 用户交互（切换类型、选择分类、输入金额等）实时更新 data
 *   4. checkCanSave 在关键操作后校验表单是否满足提交条件
 *   5. onSave 提交到后端（POST 新增 / PUT 更新），成功后返回上一页
 *   6. onDelete 仅在编辑模式下可用，弹出确认后调用 DELETE 接口
 *
 * 依赖：
 *   - api.js  —— 封装的 HTTP 请求工具（get/post/put/delete）
 *   - util.js —— 日期格式化等通用工具函数
 *   - app.js  —— 全局 App 实例，提供 ensureLogin() 确保登录态
 */

const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

Page({
  /**
   * data 字段说明：
   *
   * type            {String}  - 收支类型，'expense'（支出）或 'income'（收入），默认支出
   * categories      {Array}   - 当前类型下的分类列表，从后端 API 获取
   * selectedCategoryId {Number|null} - 用户当前选中的分类 ID，未选中时为 null
   * amount          {String}  - 用户输入的金额（字符串形式，提交时转为浮点数）
   * recordDate      {String}  - 记录日期，格式 'YYYY-MM-DD'，默认为今天
   * note            {String}  - 备注信息，选填
   * isEdit          {Boolean} - 是否为编辑模式（URL 带 id 参数时为 true）
   * editId          {Number|null} - 编辑模式下被编辑的记录 ID
   * canSave         {Boolean} - 表单是否满足保存条件（已选分类 + 金额 > 0）
   */
  data: {
    type: 'expense',
    categories: [],
    selectedCategoryId: null,
    amount: '',
    recordDate: util.formatDate(new Date()),
    note: '',
    isEdit: false,
    editId: null,
    canSave: false
  },

  /**
   * 生命周期 - 页面加载时触发
   *
   * 逻辑：
   *   - 检查 URL 参数 options.id：
   *     存在 → 进入编辑模式，设置 isEdit/editId，修改导航栏标题，加载记录详情
   *   - 无论新增还是编辑，都加载分类列表
   */
  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, editId: options.id });
      wx.setNavigationBarTitle({ title: '编辑记录' });
      this.loadRecord(options.id);
    }
    this.loadCategories();
  },

  /**
   * 加载分类列表
   *
   * 根据当前收支类型（type）请求后端获取对应的分类列表。
   * 切换类型后也会调用此方法重新获取分类。
   */
  async loadCategories() {
    try {
      await app.ensureLogin();
      const categories = await api.get('/api/categories', { type: this.data.type });
      this.setData({ categories });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  /**
   * 加载指定记录详情（仅编辑模式）
   *
   * 由于后端没有单条记录查询接口，这里采用变通方案：
   * 请求记录列表（pageSize=200），然后在前端通过 id 查找目标记录。
   * 找到后将记录的各字段填充到表单中，并重新加载对应类型的分类列表。
   *
   * @param {Number|String} id - 要加载的记录 ID
   */
  async loadRecord(id) {
    try {
      await app.ensureLogin();
      const res = await api.get('/api/records', { pageSize: 200 });
      const record = res.list.find(r => r.id == id);
      if (record) {
        this.setData({
          type: record.type,
          selectedCategoryId: record.category_id,
          amount: String(record.amount),
          recordDate: record.record_date,
          note: record.note || '',
          canSave: true
        });
        // 记录类型可能和默认值不同，需要重新加载该类型下的分类
        this.loadCategories();
      }
    } catch (e) {
      console.error('加载记录失败:', e);
    }
  },

  /**
   * 切换收支类型（支出/收入）
   *
   * 切换后需要：
   *   1. 清空已选分类（不同类型下分类不同）
   *   2. 重新加载新类型下的分类列表
   *   3. 重新校验保存按钮状态
   */
  onSwitchType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ type, selectedCategoryId: null });
    this.loadCategories();
    this.checkCanSave();
  },

  /**
   * 选择分类
   *
   * 用户点击分类网格中的某一项时触发，记录选中的分类 ID 并校验保存条件。
   */
  onSelectCategory(e) {
    this.setData({ selectedCategoryId: e.currentTarget.dataset.id });
    this.checkCanSave();
  },

  /**
   * 金额输入事件
   *
   * 每次输入变化时更新 amount 值，并重新校验保存条件。
   */
  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
    this.checkCanSave();
  },

  /**
   * 日期选择变更
   *
   * 通过微信原生日期选择器（picker mode="date"）触发，更新 recordDate。
   */
  onDateChange(e) {
    this.setData({ recordDate: e.detail.value });
  },

  /**
   * 备注输入事件
   *
   * 每次输入变化时更新 note 值。备注为选填项，不影响保存条件校验。
   */
  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  /**
   * 校验表单是否满足保存条件
   *
   * 保存条件：
   *   1. 已选中一个分类（selectedCategoryId 不为 null）
   *   2. 金额不为空（amount 有值）
   *   3. 金额转换为浮点数后大于 0
   *
   * 校验结果写入 canSave，控制保存按钮的 disabled 状态。
   */
  checkCanSave() {
    const { selectedCategoryId, amount } = this.data;
    this.setData({ canSave: !!selectedCategoryId && !!amount && parseFloat(amount) > 0 });
  },

  /**
   * 保存记录（新增或更新）
   *
   * 逻辑：
   *   1. 从 data 中取出所有表单字段，组装 payload 对象
   *   2. 确保用户已登录
   *   3. 根据 isEdit 判断：
   *      - true  → PUT /api/records/:id  更新已有记录
   *      - false → POST /api/records      创建新记录
   *   4. 成功后显示 Toast 提示，1 秒后自动返回上一页
   */
  async onSave() {
    const { type, selectedCategoryId, amount, recordDate, note, isEdit, editId } = this.data;
    const payload = {
      category_id: selectedCategoryId,
      type,
      amount: parseFloat(amount),
      note,
      record_date: recordDate
    };

    try {
      await app.ensureLogin();
      if (isEdit) {
        await api.put(`/api/records/${editId}`, payload);
      } else {
        await api.post('/api/records', payload);
      }
      wx.showToast({ title: isEdit ? '已更新' : '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (e) {
      console.error('保存失败:', e);
    }
  },

  /**
   * 删除记录（仅编辑模式可用）
   *
   * 逻辑：
   *   1. 弹出微信原生确认对话框（showModal），防止误删
   *   2. 用户点击「确认」后，调用 DELETE /api/records/:id 删除记录
   *   3. 成功后显示 Toast 提示，1 秒后自动返回上一页
   */
  async onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await app.ensureLogin();
            await api.delete(`/api/records/${this.data.editId}`);
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
          } catch (e) {
            console.error('删除失败:', e);
          }
        }
      }
    });
  }
});
