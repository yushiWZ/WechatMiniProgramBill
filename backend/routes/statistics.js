const express = require('express');
const auth = require('../middleware/auth');
const { getDB } = require('../db');

const router = express.Router();

// 分类支出饼图数据
router.get('/category-pie', auth, (req, res) => {
  const db = getDB();
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: '缺少month参数' });

  const rows = db.prepare(`
    SELECT c.name as categoryName, c.icon as categoryIcon, c.type, SUM(r.amount) as totalAmount
    FROM records r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.user_id = ? AND strftime('%Y-%m', r.record_date) = ?
    GROUP BY r.category_id
    ORDER BY totalAmount DESC
  `).all(req.userId, month);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalAmount, 0);
  const list = rows.map(r => ({
    ...r,
    percentage: grandTotal > 0 ? Math.round((r.totalAmount / grandTotal) * 100) : 0
  }));

  res.json({ list, total: grandTotal });
});

// 月度收支趋势
router.get('/monthly-trend', auth, (req, res) => {
  const db = getDB();
  const { months = 6 } = req.query;

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', record_date) as month,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
    FROM records
    WHERE user_id = ? AND record_date >= date('now', '-' || ? || ' months', 'start of month')
    GROUP BY month
    ORDER BY month ASC
  `).all(req.userId, parseInt(months) - 1);

  res.json({ list: rows });
});

module.exports = router;
