Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "记账", icon: "📝" },
      { pagePath: "/pages/statistics/statistics", text: "统计", icon: "📊" },
      { pagePath: "/pages/mine/mine", text: "我的", icon: "👤" }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const url = this.data.list[index].pagePath;
      wx.switchTab({ url });
    }
  }
});
