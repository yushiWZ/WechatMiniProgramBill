const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    activeTab: 'expense',
    categories: [],
    showModal: false,
    modalTitle: '添加分类',
    modalName: '',
    editingId: null
  },

  onShow() {
    this.loadCategories();
  },

  async loadCategories() {
    try {
      await app.ensureLogin();
      const categories = await api.get('/api/categories', { type: this.data.activeTab });
      this.setData({ categories });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  onSwitchTab(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ activeTab: type });
    this.loadCategories();
  },

  onAdd() {
    this.setData({
      showModal: true,
      modalTitle: '添加分类',
      modalName: '',
      editingId: null
    });
  },

  onEdit(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      modalTitle: '编辑分类',
      modalName: name,
      editingId: id
    });
  },

  onCloseModal() {
    this.setData({ showModal: false });
  },

  onModalNameInput(e) {
    this.setData({ modalName: e.detail.value });
  },

  async onModalConfirm() {
    const name = this.data.modalName.trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }

    try {
      await app.ensureLogin();
      if (this.data.editingId) {
        await api.put(`/api/categories/${this.data.editingId}`, { name });
      } else {
        await api.post('/api/categories', { name, type: this.data.activeTab });
      }
      this.setData({ showModal: false });
      this.loadCategories();
    } catch (e) {
      console.error('保存分类失败:', e);
    }
  },

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
