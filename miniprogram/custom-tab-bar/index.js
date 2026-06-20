/**
 * ============================================================
 * 自定义 TabBar 组件 - 逻辑控制层
 * ============================================================
 *
 * 【概述】
 * 本文件是微信小程序自定义底部导航栏（TabBar）的核心逻辑文件。
 * 微信小程序允许开发者通过 custom-tab-bar 目录替换系统默认的 TabBar，
 * 从而实现更灵活的底部导航样式和交互效果。
 *
 * 【组件机制】
 * 自定义 TabBar 本质上是一个微信自定义组件（Component），
 * 它会在每个 Tab 页面加载时被实例化并渲染在页面底部。
 * 因此，切换 Tab 页面时组件会被重新创建，
 * 需要在每个 Tab 页面的 onShow 生命周期中同步选中状态。
 *
 * 【数据流】
 * list 数组定义了所有 Tab 项的配置信息（路径、文字、图标），
 * selected 字段记录当前选中的 Tab 索引，
 * 当用户点击某个 Tab 时，通过 switchTab 方法调用 wx.switchTab 跳转页面。
 * ============================================================
 */

Component({
  /**
   * 组件的初始数据
   *
   * selected: 当前选中 Tab 的索引值（从 0 开始），
   *           默认值为 0，即第一个 Tab"记账"处于选中状态。
   *           注意：由于自定义 TabBar 在每个页面都会重新实例化，
   *           实际选中状态需要在各 Tab 页面的 onShow 中通过
   *           this.getTabBar().setData({ selected: N }) 来同步。
   *
   * list:     Tab 项配置数组，每一项包含：
   *           - pagePath: 对应页面的路由路径（必须是 app.json 中 tabBar 注册的路径）
   *           - text:     Tab 显示的文字标签
   *           - icon:     Tab 显示的图标（此处使用 Emoji 字符作为图标）
   */
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "记账", icon: "📝" },
      { pagePath: "/pages/statistics/statistics", text: "统计", icon: "📊" },
      { pagePath: "/pages/mine/mine", text: "我的", icon: "👤" }
    ]
  },

  /**
   * 组件的方法集合
   */
  methods: {
    /**
     * Tab 切换事件处理函数
     *
     * 【触发时机】
     * 当用户点击任意一个 Tab 项时触发（由 WXML 中的 bindtap 绑定）。
     *
     * 【参数说明】
     * e - 事件对象，其中 e.currentTarget.dataset.index 携带了被点击 Tab 的索引值。
     *     该索引值通过 WXML 模板中的 data-index="{{index}}" 属性传递过来。
     *
     * 【执行逻辑】
     * 1. 从事件对象的 dataset 中取出被点击 Tab 的索引 index；
     * 2. 根据索引从 list 数组中获取对应的页面路径 pagePath；
     * 3. 调用 wx.switchTab API 跳转到目标 Tab 页面。
     *    注意：wx.switchTab 只能跳转到 tabBar 配置中声明的页面，
     *          跳转成功后目标页面会在 onShow 中更新 TabBar 的选中状态。
     */
    switchTab(e) {
      // 获取被点击 Tab 的索引（通过 data-index 传递）
      const index = e.currentTarget.dataset.index;
      // 根据索引从 list 中取出目标页面路径
      const url = this.data.list[index].pagePath;
      // 调用微信 API 切换到对应的 Tab 页面
      wx.switchTab({ url });
    }
  }
});
