/**
 * ============================================================
 * 分类管理页面 (category)
 * ============================================================
 *
 * 功能概述：
 *   本页面用于管理用户的自定义收支分类，支持完整的 CRUD 操作：
 *     - Create：点击"添加分类"按钮，弹出输入框创建新分类
 *     - Read  ：页面加载时按当前 Tab（支出/收入）加载分类列表
 *     - Update：点击分类行的"编辑"按钮，弹出输入框修改分类名称
 *     - Delete：点击分类行的"删除"按钮，弹出确认后删除分类
 *
 * 交互设计：
 *   - 顶部 Tab 栏切换支出分类和收入分类
 *   - 系统默认分类（is_default=true）不可编辑和删除，仅显示"系统"标签
 *   - 自定义分类显示编辑/删除操作按钮
 *   - 添加/编辑共用同一个模态弹窗，通过 editingId 区分操作类型
 *
 * 依赖：
 *   - api.js —— 封装的 HTTP 请求工具
 *   - app.js —— 全局 App 实例，提供 ensureLogin() 确保登录态
 */

const api = require('../../utils/api');
const { getIcon } = require('../../utils/iconMap');
const app = getApp();

Page({
  /**
   * data 字段说明：
   *
   * activeTab   {String}  - 当前激活的 Tab 类型，'expense'（支出）或 'income'（收入）
   * categories  {Array}   - 当前类型下的分类列表，每项包含 id/name/is_default 等字段
   * showModal   {Boolean} - 是否显示添加/编辑分类的模态弹窗
   * modalTitle  {String}  - 弹窗标题，添加时为"添加分类"，编辑时为"编辑分类"
   * modalName   {String}  - 弹窗输入框中的分类名称（实时绑定）
   * editingId   {Number|null} - 编辑模式下的分类 ID；为 null 表示当前处于添加模式
   */
  data: {
    activeTab: 'expense',
    categories: [],
    showModal: false,
    modalTitle: '添加分类',
    modalName: '',
    editingId: null
  },

  /**
   * 生命周期 - 页面显示时触发
   *
   * 使用 onShow 而非 onLoad，确保从其他页面返回时（如添加记录页）
   * 能自动刷新分类列表，反映最新数据。
   */
  onShow() {
    this.loadCategories();
  },

  /**
   * 加载分类列表
   *
   * 根据当前激活的 Tab 类型（activeTab）请求后端获取分类列表。
   * 每次切换 Tab、添加、编辑、删除操作后都会调用此方法刷新。
   */
  async loadCategories() {
    try {
      await app.ensureLogin();
      const categories = await api.get('/api/categories', { type: this.data.activeTab });
      this.setData({ categories: categories.map(c => ({ ...c, icon: getIcon(c.icon) })) });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  /**
   * 切换 Tab（支出分类 / 收入分类）
   *
   * 通过 data-type 获取目标类型，更新 activeTab 后重新加载分类列表。
   */
  onSwitchTab(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ activeTab: type });
    this.loadCategories();
  },

  /**
   * 点击"添加分类"按钮
   *
   * 打开弹窗并重置为添加模式：
   *   - showModal = true  → 显示弹窗
   *   - modalTitle = '添加分类'
   *   - modalName = ''    → 清空输入框
   *   - editingId = null  → 标记为新增（非编辑）
   */
  onAdd() {
    this.setData({
      showModal: true,
      modalTitle: '添加分类',
      modalName: '',
      editingId: null
    });
  },

  /**
   * 点击某个分类的"编辑"按钮
   *
   * 打开弹窗并填充为编辑模式：
   *   - showModal = true
   *   - modalTitle = '编辑分类'
   *   - modalName = 当前分类名称（方便用户修改）
   *   - editingId = 当前分类 ID（用于后续 PUT 请求）
   */
  onEdit(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      modalTitle: '编辑分类',
      modalName: name,
      editingId: id
    });
  },

  /**
   * 关闭弹窗
   *
   * 点击遮罩层或"取消"按钮时触发，仅隐藏弹窗，不提交数据。
   */
  onCloseModal() {
    this.setData({ showModal: false });
  },

  /**
   * 弹窗中输入框的输入事件
   *
   * 实时将用户输入的分类名称同步到 modalName。
   */
  onModalNameInput(e) {
    this.setData({ modalName: e.detail.value });
  },

  /**
   * 弹窗点击"确定"按钮 —— 提交添加或编辑操作
   *
   * 逻辑：
   *   1. 校验输入：名称去除首尾空格后不能为空
   *   2. 确保用户已登录
   *   3. 根据 editingId 判断操作类型：
   *      - 有值 → PUT /api/categories/:id  更新分类名称
   *      - 无值 → POST /api/categories      创建新分类（附带当前 Tab 类型）
   *   4. 成功后关闭弹窗并刷新列表
   */
  async onModalConfirm() {
    const name = this.data.modalName.trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }

    try {
      await app.ensureLogin();
      if (this.data.editingId) {
        // 编辑模式：更新已有分类的名称
        await api.put(`/api/categories/${this.data.editingId}`, { name });
      } else {
        // 添加模式：创建新分类，类型跟随当前 Tab
        await api.post('/api/categories', { name, type: this.data.activeTab });
      }
      this.setData({ showModal: false });
      this.loadCategories();
    } catch (e) {
      console.error('保存分类失败:', e);
    }
  },

  /**
   * 删除分类
   *
   * 逻辑：
   *   1. 弹出微信原生确认对话框（showModal），防止误删
   *   2. 用户点击「确认」后，调用 DELETE /api/categories/:id
   *   3. 成功后自动刷新分类列表
   *
   * 注意：系统默认分类（is_default=true）在前端模板中隐藏了删除按钮，
   * 因此此方法只会被用户自定义分类触发。
   */
  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await app.ensureLogin();
            await api.delete(`/api/categories/${id}`);
            this.loadCategories();
          } catch (e) {
            console.error('删除分类失败:', e);
          }
        }
      }
    });
  }
});
