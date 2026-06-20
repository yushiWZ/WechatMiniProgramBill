/**
 * ========================================================================
 * 文件：app.js — 小程序应用入口文件
 * ========================================================================
 *
 * 本文件是"智能记账本"微信小程序的顶层入口，由微信框架在启动时最先执行。
 * 它通过 App() 构造函数注册小程序实例，负责：
 *   1. 维护全局共享数据（globalData）—— 登录凭证与用户信息
 *   2. 在应用启动时（onLaunch）从本地缓存恢复登录态，避免用户重复登录
 *   3. 提供统一的登录方法（login）和登录守卫方法（ensureLogin），
 *      供各页面在需要鉴权时调用
 *
 * 依赖模块：
 *   - ./utils/auth：封装了微信登录 + 后端换取 token 的完整流程
 * ========================================================================
 */

/* 引入认证工具模块，提供 login() 等与后端交互的方法 */
const auth = require('./utils/auth');

App({

  /**
   * 全局数据对象 —— 所有页面均可通过 getApp().globalData 访问
   *
   * @property {Object|null} userInfo  用户基本信息（头像、昵称等），
   *                                   未登录时为 null
   * @property {string|null} token     后端签发的鉴权令牌（JWT 等），
   *                                   所有需要登录态的 API 请求都依赖此值；
   *                                   为 null 表示当前未登录
   *
   * 设计说明：
   *   将 token 和 userInfo 放在 globalData 而非各页面自行管理，
   *   是为了保证整个小程序只有一份"登录态真相源"，
   *   避免多页面间状态不一致的问题。
   */
  globalData: {
    userInfo: null,
    token: null
  },

  /**
   * 应用启动生命周期 —— 小程序初始化时执行（仅执行一次）
   *
   * 核心职责：从本地缓存（Storage）中恢复上次的登录态。
   *
   * 处理流程：
   *   1. 通过 wx.getStorageSync 同步读取缓存中的 token 和 userInfo
   *   2. 若 token 存在，说明用户之前已成功登录且未主动退出，
   *      将其恢复到 globalData 中，这样用户再次打开小程序时无需重新登录
   *   3. 若 token 不存在（首次使用 / 缓存已清除 / 已退出登录），
   *      globalData 保持初始的 null 值，后续由页面按需触发登录
   *
   * 设计决策：
   *   - 使用同步 API（getStorageSync）而非异步 API，是因为 onLaunch
   *     中需要确保在页面 onLoad 之前就完成状态恢复，避免页面拿到 null token
   *   - 此处只做"恢复"，不做 token 有效性校验；
   *     若 token 已过期，会在后续 API 调用时由后端返回 401，
   *     再由请求拦截层统一处理重新登录
   */
  onLaunch() {
    // 从本地缓存同步读取 token 和用户信息，尝试恢复登录状态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');

    // 缓存中存在 token，说明之前已登录，恢复到全局数据
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
  },

  /**
   * 执行登录 —— 调用后端接口完成完整的登录流程
   *
   * 内部委托 auth.login() 执行以下步骤（详见 utils/auth.js）：
   *   1. 调用 wx.login() 获取微信临时登录凭证 code
   *   2. 将 code 发送到后端，后端向微信服务器换取 openid / session_key
   *   3. 后端签发自有 token（如 JWT）并返回用户信息
   *
   * 登录成功后：
   *   - 将 token 和 userInfo 写入 globalData（内存态）
   *   - auth.login() 内部还会将其持久化到 Storage（缓存态），
   *     以便下次启动时 onLaunch 可以恢复
   *   - 返回 user 对象，供调用方（如页面）直接使用
   *
   * 登录失败时：
   *   - 打印错误日志便于调试
   *   - 向上抛出异常，由调用方决定如何展示错误（如 Toast 提示）
   *
   * @returns {Promise<Object>} 登录成功后返回用户信息对象
   * @throws  {Error}           登录失败时抛出异常
   */
  async login() {
    try {
      /* 调用 auth 模块执行微信登录 + 后端换取 token 的完整流程 */
      const { token, user } = await auth.login();

      /* 登录成功：将凭证保存到全局数据，供后续所有页面使用 */
      this.globalData.token = token;
      this.globalData.userInfo = user;

      return user;
    } catch (e) {
      console.error('登录失败:', e);
      throw e;
    }
  },

  /**
   * 登录守卫 —— 确保当前已处于登录状态
   *
   * 这是一个"懒登录"策略的核心方法，适用于任何需要登录态才能执行的场景。
   * 调用方无需关心当前是否已登录，只需调用 ensureLogin() 即可保证拿到用户信息。
   *
   * 处理逻辑：
   *   1. 检查 globalData.token 是否已存在（内存中已登录）
   *      - 若存在：直接返回已缓存的 userInfo，避免重复请求
   *      - 若不存在：调用 this.login() 触发完整登录流程
   *   2. 无论走哪条路径，最终都返回一个包含 userInfo 的 Promise
   *
   * 典型使用场景：
   *   - 页面 onShow 时调用，确保展示用户数据前已登录
   *   - 发起需要鉴权的 API 请求前调用
   *
   * @returns {Promise<Object>} 用户信息对象
   *
   * @example
   *   const app = getApp();
   *   const userInfo = await app.ensureLogin();
   *   // 此时可以安全地发起需要登录态的请求
   */
  async ensureLogin() {
    /* 如果全局已有 token，说明已登录，直接返回用户信息（避免重复登录） */
    if (this.globalData.token) return this.globalData.userInfo;

    /* 否则触发完整登录流程 */
    return this.login();
  }
});
