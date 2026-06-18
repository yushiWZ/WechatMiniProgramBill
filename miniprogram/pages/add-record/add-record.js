const api = require('../../utils/api');
const util = require('../../utils/util');
const app = getApp();

Page({
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

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, editId: options.id });
      wx.setNavigationBarTitle({ title: '编辑记录' });
      this.loadRecord(options.id);
    }
    this.loadCategories();
  },

  async loadCategories() {
    try {
      await app.ensureLogin();
      const categories = await api.get('/api/categories', { type: this.data.type });
      this.setData({ categories });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

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
        this.loadCategories();
      }
    } catch (e) {
      console.error('加载记录失败:', e);
    }
  },

  onSwitchType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ type, selectedCategoryId: null });
    this.loadCategories();
    this.checkCanSave();
  },

  onSelectCategory(e) {
    this.setData({ selectedCategoryId: e.currentTarget.dataset.id });
    this.checkCanSave();
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
    this.checkCanSave();
  },

  onDateChange(e) {
    this.setData({ recordDate: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  checkCanSave() {
    const { selectedCategoryId, amount } = this.data;
    this.setData({ canSave: !!selectedCategoryId && !!amount && parseFloat(amount) > 0 });
  },

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
