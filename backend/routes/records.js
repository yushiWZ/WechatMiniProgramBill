/**
 * ============================================================
 * 智能记账本 - 账单记录 CRUD 路由
 * ============================================================
 *
 * 本文件实现账单记录的完整增删改查功能，是系统的核心业务模块。
 * 所有接口均需要 JWT 认证（通过 auth 中间件），且自动进行用户数据隔离
 * （每个用户只能操作自己的账单记录）。
 *
 * 【接口列表】
 *   GET    /api/records       - 获取账单记录列表（支持分页、按月筛选、按类型筛选）
 *   POST   /api/records       - 新增一笔记账记录
 *   PUT    /api/records/:id   - 更新指定记账记录
 *   DELETE /api/records/:id   - 删除指定记账记录
 *
 * 【安全设计】
 *   - 每个查询都带有 user_id = req.userId 条件，防止用户访问他人数据
 *   - 更新和删除前先查询确认记录属于当前用户，不存在则返回 404
 *   - 写操作后调用 saveToFile() 将内存数据库持久化到磁盘
 */

const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

/**
 * GET /api/records
 * 获取账单记录列表（分页 + 筛选）
 *
 * 【查询参数】（Query String）
 *   - month: string (可选)
 *     月份筛选，格式 "YYYY-MM"，如 "2024-06"
 *     使用 SQLite 的 strftime('%Y-%m', record_date) 函数提取日期中的年月部分进行比较
 *
 *   - type: string (可选)
 *     收支类型筛选，可选值：'income'（收入）或 'expense'（支出）
 *     传入其他值会被忽略（安全性校验）
 *
 *   - page: number (可选，默认 1)
 *     当前页码，从 1 开始
 *
 *   - pageSize: number (可选，默认 50)
 *     每页记录数
 *
 * 【响应数据】（JSON）
 *   - list: Array
 *     账单记录数组，每条记录包含完整的记录信息和关联的分类名称/图标
 *   - total: number
 *     符合条件的记录总数（用于前端分页）
 *   - incomeTotal: number
 *     当前筛选条件下的收入合计
 *   - expenseTotal: number
 *     当前筛选条件下的支出合计
 *
 * 【SQL 逻辑说明】
 *   本接口执行三条 SQL 查询：
 *   1. COUNT 查询：计算符合条件的总记录数（用于分页）
 *   2. SELECT 查询：通过 LEFT JOIN 关联 categories 表获取分类信息，
 *      按 record_date DESC（日期降序）和 created_at DESC（创建时间降序）排序，
 *      使用 LIMIT/OFFSET 实现分页
 *   3. SUM 查询：使用 CASE WHEN 条件聚合，分别计算收入和支出合计
 */
router.get('/', auth, (req, res) => {
  const db = getDB();

  // 从查询参数中解构筛选条件，设置分页默认值
  const { month, type, page = 1, pageSize = 50 } = req.query;

  // 计算 SQL 分页偏移量
  // 例如第 2 页、每页 50 条 → offset = (2-1) * 50 = 50，即跳过前 50 条
  const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

  // 动态构建 WHERE 子句
  // 基础条件：只查询当前登录用户的记录（数据隔离）
  let whereClause = 'WHERE r.user_id = ?';
  const params = [req.userId];

  // 如果指定了月份筛选，追加 strftime 条件
  // strftime('%Y-%m', record_date) 提取日期字段的"年-月"部分，如 "2024-06"
  if (month) {
    whereClause += ' AND strftime(\'%Y-%m\', r.record_date) = ?';
    params.push(month);
  }

  // 如果指定了类型筛选，追加类型条件
  // 使用 includes() 校验确保 type 值合法，防止 SQL 注入
  if (type && ['income', 'expense'].includes(type)) {
    whereClause += ' AND r.type = ?';
    params.push(type);
  }

  // 查询 1：获取符合条件的总记录数（用于前端显示和分页计算）
  const countSql = `SELECT COUNT(*) as total FROM records r ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  // 查询 2：获取当前页的账单记录列表
  // LEFT JOIN categories 表：即使记录没有关联分类（category_id 为 NULL），
  // 也能返回记录数据（分类字段为 NULL），不会丢失记录
  // ORDER BY record_date DESC, created_at DESC：先按日期降序，同一天内按创建时间降序
  const dataSql = `
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r
    LEFT JOIN categories c ON r.category_id = c.id
    ${whereClause}
    ORDER BY r.record_date DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const list = db.prepare(dataSql).all(...params, parseInt(pageSize, 10), offset);

  // 查询 3：计算当前筛选条件下的收支合计
  // 使用 CASE WHEN 条件表达式实现"行转列"聚合：
  //   - 当 type = 'income' 时取 amount，否则取 0，然后求和 → 收入合计
  //   - 当 type = 'expense' 时取 amount，否则取 0，然后求和 → 支出合计
  // COALESCE(..., 0)：当没有匹配记录时 SUM 返回 NULL，COALESCE 将其转为 0
  const sumSql = `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as incomeTotal,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenseTotal
    FROM records r ${whereClause}
  `;
  const sums = db.prepare(sumSql).get(...params);

  // 返回分页列表和汇总数据
  res.json({ list, total, incomeTotal: sums.incomeTotal, expenseTotal: sums.expenseTotal });
});

/**
 * POST /api/records
 * 新增一笔记账记录
 *
 * 【请求参数】（JSON Body）
 *   - category_id: number (可选)
 *     分类 ID，关联 categories 表。不传或传 null 表示未分类
 *   - type: string (必填)
 *     收支类型，'income'（收入）或 'expense'（支出）
 *   - amount: number (必填)
 *     金额，正数，最大 99999999.99
 *   - note: string (可选)
 *     备注信息，最多 256 字符
 *   - record_date: string (必填)
 *     记账日期，格式 "YYYY-MM-DD"
 *
 * 【响应数据】（JSON）
 *   新创建的完整记录对象，包含自动关联的分类信息
 *
 * 【错误码】
 *   - 400: 缺少必填字段 / 类型值无效
 */
router.post('/', auth, (req, res) => {
  const db = getDB();

  // 从请求体中提取各字段
  const { category_id, type, amount, note, record_date } = req.body;

  // 必填字段校验：type、amount、record_date 缺一不可
  if (!type || !amount || !record_date) {
    return res.status(400).json({ error: '类型、金额和日期不能为空' });
  }

  // type 值合法性校验，只允许 'income' 或 'expense'
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: '类型无效' });
  }

  // 插入新记录到 records 表
  // user_id 从认证中间件注入的 req.userId 获取（而非客户端传入），确保数据归属正确
  // category_id 未传时设为 null，note 未传时设为空字符串
  const result = db.prepare(
    'INSERT INTO records (user_id, category_id, type, amount, note, record_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, category_id || null, type, amount, note || '', record_date);

  // 查询刚插入的完整记录（LEFT JOIN 获取分类名称和图标）
  // result.lastInsertRowid 是 SQLite 返回的最后插入行的主键 ID
  const record = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);

  // 写操作后必须持久化到磁盘
  saveToFile();
  res.json(record);
});

/**
 * PUT /api/records/:id
 * 更新指定记账记录
 *
 * 【路径参数】
 *   - id: number
 *     要更新的记录 ID
 *
 * 【请求参数】（JSON Body，均可选，只更新传入的字段）
 *   - category_id: number
 *   - amount: number
 *   - note: string
 *   - record_date: string (格式 "YYYY-MM-DD")
 *
 * 【响应数据】（JSON）
 *   更新后的完整记录对象
 *
 * 【错误码】
 *   - 404: 记录不存在或不属于当前用户
 *
 * 【SQL 逻辑说明】
 *   使用 COALESCE(?, 原字段) 实现部分更新：
 *   - 如果参数传入了值（非 NULL），则用新值覆盖
 *   - 如果参数未传入（值为 NULL），则保持原值不变
 *   这样前端只需传入要修改的字段，无需发送完整数据
 */
router.put('/:id', auth, (req, res) => {
  const db = getDB();

  // 先查询目标记录，同时验证记录是否属于当前用户
  // WHERE id = ? AND user_id = ? 双重条件确保数据隔离
  const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  // 从请求体中提取要更新的字段
  const { category_id, amount, note, record_date } = req.body;

  // 使用 COALESCE 实现部分字段更新
  // COALESCE(新值, 原值)：如果新值不为 NULL 则用新值，否则保留原值
  // 对于 amount 和 note，需要区分"未传入"和"传入空值"：
  //   - amount !== undefined ? amount : null → 未传时传 null（保持原值），传了就用新值
  //   - note !== undefined ? note : null → 同上
  db.prepare(
    'UPDATE records SET category_id = COALESCE(?, category_id), amount = COALESCE(?, amount), note = COALESCE(?, note), record_date = COALESCE(?, record_date) WHERE id = ?'
  ).run(category_id || null, amount !== undefined ? amount : null, note !== undefined ? note : null, record_date || null, req.params.id);

  // 查询更新后的完整记录（关联分类信息）
  const updated = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(req.params.id);

  // 写操作后持久化
  saveToFile();
  res.json(updated);
});

/**
 * DELETE /api/records/:id
 * 删除指定记账记录
 *
 * 【路径参数】
 *   - id: number
 *     要删除的记录 ID
 *
 * 【响应数据】（JSON）
 *   { success: true }
 *
 * 【错误码】
 *   - 404: 记录不存在或不属于当前用户
 *
 * 【安全设计】
 *   删除前先查询确认记录存在且属于当前用户，
 *   防止通过猜测 ID 删除其他用户的记录（越权操作）
 */
router.delete('/:id', auth, (req, res) => {
  const db = getDB();

  // 验证记录是否属于当前用户（双重条件查询）
  const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  // 执行删除操作
  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);

  // 写操作后持久化
  saveToFile();
  res.json({ success: true });
});

module.exports = router;
