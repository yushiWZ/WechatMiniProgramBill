/**
 * ============================================================
 * 智能记账本 - Express 应用入口文件
 * ============================================================
 *
 * 本文件是整个后端服务的启动入口，负责：
 *   1. 创建 Express 应用实例
 *   2. 注册全局中间件（CORS 跨域、JSON 请求体解析）
 *   3. 挂载各功能模块的路由
 *   4. 提供健康检查接口
 *   5. 注册全局错误处理中间件
 *   6. 初始化数据库后启动 HTTP 服务
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDB } = require('./db');

// 创建 Express 应用实例
const app = express();

// ---------- 全局中间件 ----------

// CORS（Cross-Origin Resource Sharing）中间件
// 允许微信小程序前端跨域请求本后端接口，开发调试阶段也允许浏览器直接调用
app.use(cors());

// JSON 请求体解析中间件
// 自动将 Content-Type 为 application/json 的请求体解析为 JavaScript 对象，
// 使后续路由可以通过 req.body 获取前端提交的 JSON 数据
app.use(express.json());

// ---------- 路由挂载 ----------

// 登录认证路由 —— 处理微信小程序登录，路径前缀: /api/auth
app.use('/api/auth', require('./routes/auth'));

// 账单记录路由 —— 增删改查记账记录，路径前缀: /api/records
app.use('/api/records', require('./routes/records'));

// 分类管理路由 —— 管理收支分类，路径前缀: /api/categories
app.use('/api/categories', require('./routes/categories'));

// 统计接口路由 —— 饼图、趋势图等统计图表数据，路径前缀: /api/statistics
app.use('/api/statistics', require('./routes/statistics'));

// 预算接口路由 —— 月度预算设置与查询，路径前缀: /api/budgets
app.use('/api/budgets', require('./routes/budgets'));

// ---------- 健康检查接口 ----------

// GET /api/health
// 用于负载均衡、容器编排（如 Docker / K8s）检测服务是否存活
// 无需认证，直接返回 { status: 'ok' }
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---------- 全局错误处理中间件 ----------

// Express 错误处理中间件必须声明四个参数 (err, req, res, next)
// 当前面任何路由或中间件调用 next(err) 或抛出异常时，会被这里捕获
// 统一返回 HTTP 500 状态码，避免将内部错误堆栈暴露给客户端
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器错误' });
});

// ---------- 异步初始化数据库并启动服务 ----------

// 先调用 initDB() 完成数据库的初始化和表结构创建（详见 db.js），
// 数据库就绪后再启动 HTTP 监听，确保服务启动后即可正常处理数据库请求。
// 如果数据库初始化失败（如文件损坏、磁盘空间不足等），
// 则记录错误日志并以非零退出码退出进程，阻止服务带病上线。
initDB().then(() => {
  app.listen(config.port, () => {
    console.log(`服务器启动: http://localhost:${config.port}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
