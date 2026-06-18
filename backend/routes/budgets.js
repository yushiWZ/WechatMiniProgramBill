const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

// 获取预算
router.get('/', auth, (req, res) => {
  const db = getDB();
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: '缺少month参数' });

  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);
  if (!budget) return res.json(null);

  // 计算当月已支出
  const { totalExpense } = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as totalExpense FROM records WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', record_date) = ?"
  ).get(req.userId, month);

  const percentage = budget.amount > 0 ? Math.round((totalExpense / budget.amount) * 100) : 0;

  res.json({ budget, monthExpense: totalExpense, percentage });
});

// 设置预算
router.post('/', auth, (req, res) => {
  const db = getDB();
  const { month, amount } = req.body;
  if (!month || !amount) return res.status(400).json({ error: '月份和金额不能为空' });

  // upsert
  const existing = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);
  if (existing) {
    db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(amount, existing.id);
  } else {
    db.prepare('INSERT INTO budgets (user_id, month, amount) VALUES (?, ?, ?)').run(req.userId, month, amount);
  }

  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.userId, month);
  saveToFile();
  res.json(budget);
});

// 更新预算
router.put('/:id', auth, (req, res) => {
  const db = getDB();
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!budget) return res.status(404).json({ error: '预算不存在' });

  const { amount } = req.body;
  db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(amount, req.params.id);

  const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  saveToFile();
  res.json(updated);
});

module.exports = router;
