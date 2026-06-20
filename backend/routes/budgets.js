/**
 * ============================================================
 * 智能记账本 - 预算管理路由
 * ============================================================
 *
 * 本文件实现月度预算的设置与查询功能，帮助用户控制每月支出。
 * 所有接口均需 JWT 认证。
 *
 * 【接口列表】
 *   GET  /api/budgets       - 获取指定月份的预算及支出进度
 *   POST /api/budgets       - 设置或更新月度预算（upsert 语义）
 *   PUT  /api/budgets/:id   - 更新已有预算记录的金额
 *
 * 【业务逻辑】
 *   - 每个用户每个月只能设置一个预算金额（由 budgets 表的 UNIQUE(user_id, month) 约束保证）
 *   - GET 接口不仅返回预算金额，还会实时计算当月已支出金额和预算使用百分比
 *     前端可据此渲染进度条或环形图，直观展示预算消耗情况
 *   - POST 接口使用 "upsert" 模式：如果该月已有预算则更新金额，否则新建记录
 */

const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

/**
 * GET /api/budgets
 * 获取指定月份的预算信息及支出进度
 *
 * 【查询参数】（Query String）
 *   - month: string (必填)
 *     月份，格式 "YYYY-MM"，如 "2024-06"
 *
 * 【响应数据】（JSON）
 *   如果有预算设置：
 *   {
 *     budget: { id, user_id, month, amount },  // 预算记录
 *     monthExpense: number,                     // 当月已支出合计
 *     percentage: number                        // 预算使用百分比（0-100 整数）
 *   }
 *   如果未设置预算：
 *   null
 *
 * 【错误码】
 *   - 400: 缺少 month 参数
 *
 * 【计算逻辑】
 *   1. 查询 budgets 表获取该月的预算金额
 *   2. 如果预算不存在，直接返回 null（前端可提示用户设置预算）
 *   3. 如果预算存在，实时查询 records 表计算当月支出合计
 *   4. 计算百分比 = (已支出 / 预算金额) * 100，取整
 *      - 预算金额为 0 时百分比返回 0（防止除以 0）
 *      - 百分比可能超过 100（超支场景），前端可据此显示红色警告
 */
router.get('/', auth, (req, res) => {
  const db = getDB();
  const { month } = req.query;

  // month 是必填参数
  if (!month) return res.status(400).json({ error: '缺少month参数' });

  // 查询该月的预算记录
  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);

  // 如果没有设置预算，返回 null 让前端知道用户尚未设定预算
  if (!budget) return res.json(null);

  // 计算当月已支出合计
  // 只统计 type = 'expense' 的记录，使用 COALESCE 处理无记录时 SUM 返回 NULL 的情况
  // strftime('%Y-%m', record_date) 匹配指定月份的所有账单
  const { totalExpense } = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as totalExpense FROM records WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', record_date) = ?"
  ).get(req.userId, month);

  // 计算预算使用百分比
  // Math.round() 取整，budget.amount > 0 时计算，否则返回 0
  const percentage = budget.amount > 0 ? Math.round((totalExpense / budget.amount) * 100) : 0;

  // 返回预算信息、已支出金额和使用百分比
  res.json({ budget, monthExpense: totalExpense, percentage });
});

/**
 * POST /api/budgets
 * 设置或更新月度预算（upsert 模式）
 *
 * "upsert" = update + insert，根据数据是否存在决定更新或新建。
 *
 * 【请求参数】（JSON Body）
 *   - month: string (必填)
 *     月份，格式 "YYYY-MM"
 *   - amount: number (必填)
 *     预算金额，正数
 *
 * 【响应数据】（JSON）
 *   设置/更新后的预算记录对象 { id, user_id, month, amount }
 *
 * 【错误码】
 *   - 400: 缺少必填字段
 *
 * 【upsert 实现逻辑】
 *   由于 SQLite 的 INSERT OR REPLACE 在触发 UNIQUE 约束时会删除旧记录再插入新记录
 *   （导致 id 变化），这里采用"先查后判"的方式：
 *   1. 查询是否已有该月的预算记录
 *   2. 如果存在 → UPDATE 更新金额（保留原 id）
 *   3. 如果不存在 → INSERT 创建新记录
 *   4. 最后再查询一次返回最新数据
 */
router.post('/', auth, (req, res) => {
  const db = getDB();
  const { month, amount } = req.body;

  // 必填字段校验
  if (!month || !amount) return res.status(400).json({ error: '月份和金额不能为空' });

  // 查询是否已有该月的预算记录，决定执行 update 还是 insert
  const existing = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);
  if (existing) {
    // 已有预算记录：更新金额（保留原记录 ID）
    db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(amount, existing.id);
  } else {
    // 首次设置该月预算：插入新记录
    db.prepare('INSERT INTO budgets (user_id, month, amount) VALUES (?, ?, ?)').run(req.userId, month, amount);
  }

  // 查询最新的预算记录并返回
  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);

  // 写操作后持久化到磁盘
  saveToFile();
  res.json(budget);
});

/**
 * PUT /api/budgets/:id
 * 更新已有预算记录的金额
 *
 * 【路径参数】
 *   - id: number
 *     要更新的预算记录 ID
 *
 * 【请求参数】（JSON Body）
 *   - amount: number
 *     新的预算金额
 *
 * 【响应数据】（JSON）
 *   更新后的预算记录对象
 *
 * 【错误码】
 *   - 404: 预算记录不存在或不属于当前用户
 *
 * 【与 POST 接口的区别】
 *   - POST 是"设置预算"语义（upsert），适合前端"设置月度预算"按钮
 *   - PUT 是"更新预算"语义，需要已知预算记录 ID，适合编辑场景
 */
router.put('/:id', auth, (req, res) => {
  const db = getDB();

  // 查询目标预算记录并验证归属
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!budget) return res.status(404).json({ error: '预算不存在' });

  // 从请求体获取新金额并执行更新
  const { amount } = req.body;
  db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(amount, req.params.id);

  // 查询更新后的记录并返回
  const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);

  // 写操作后持久化
  saveToFile();
  res.json(updated);
});

module.exports = router;
