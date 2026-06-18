const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/records', require('./routes/records'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/statistics', require('./routes/statistics'));
app.use('/api/budgets', require('./routes/budgets'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器错误' });
});

// 异步初始化数据库后启动服务
initDB().then(() => {
  app.listen(config.port, () => {
    console.log(`服务器启动: http://localhost:${config.port}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
