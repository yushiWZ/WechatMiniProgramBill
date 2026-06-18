const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

// 获取记录列表（分页 + 筛选）
router.get('/', auth, (req, res) => {
  const db = getDB();
  const { month, type, page = 1, pageSize = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

  let whereClause = 'WHERE r.user_id = ?';
  const params = [req.userId];

  if (month) {
    whereClause += ' AND strftime(\'%Y-%m\', r.record_date) = ?';
    params.push(month);
  }
  if (type && ['income', 'expense'].includes(type)) {
    whereClause += ' AND r.type = ?';
    params.push(type);
  }

  const countSql = `SELECT COUNT(*) as total FROM records r ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  const dataSql = `
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r
    LEFT JOIN categories c ON r.category_id = c.id
    ${whereClause}
    ORDER BY r.record_date DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const list = db.prepare(dataSql).all(...params, parseInt(pageSize, 10), offset);

  // 计算收支合计
  const sumSql = `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as incomeTotal,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenseTotal
    FROM records r ${whereClause}
  `;
  const sums = db.prepare(sumSql).get(...params);

  res.json({ list, total, incomeTotal: sums.incomeTotal, expenseTotal: sums.expenseTotal });
});

// 添加记录
router.post('/', auth, (req, res) => {
  const db = getDB();
  const { category_id, type, amount, note, record_date } = req.body;

  if (!type || !amount || !record_date) {
    return res.status(400).json({ error: '类型、金额和日期不能为空' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: '类型无效' });
  }

  const result = db.prepare(
    'INSERT INTO records (user_id, category_id, type, amount, note, record_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, category_id || null, type, amount, note || '', record_date);

  const record = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);

  saveToFile();
  res.json(record);
});

// 更新记录
router.put('/:id', auth, (req, res) => {
  const db = getDB();
  const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  const { category_id, amount, note, record_date } = req.body;
  db.prepare(
    'UPDATE records SET category_id = COALESCE(?, category_id), amount = COALESCE(?, amount), note = COALESCE(?, note), record_date = COALESCE(?, record_date) WHERE id = ?'
  ).run(category_id || null, amount !== undefined ? amount : null, note !== undefined ? note : null, record_date || null, req.params.id);

  const updated = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM records r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(req.params.id);

  saveToFile();
  res.json(updated);
});

// 删除记录
router.delete('/:id', auth, (req, res) => {
  const db = getDB();
  const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);
  saveToFile();
  res.json({ success: true });
});

module.exports = router;
