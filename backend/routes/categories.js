const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

// 获取分类列表（系统默认 + 用户自定义）
router.get('/', auth, (req, res) => {
  const db = getDB();
  const { type } = req.query;

  let sql = 'SELECT * FROM categories WHERE (user_id = 0 OR user_id = ?)';
  const params = [req.userId];

  if (type && ['income', 'expense'].includes(type)) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY is_default DESC, sort_order ASC, id ASC';
  const categories = db.prepare(sql).all(...params);
  res.json(categories);
});

// 添加自定义分类
router.post('/', auth, (req, res) => {
  const { name, type, icon } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: '名称和类型不能为空' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: '类型无效' });
  }

  const db = getDB();
  const result = db.prepare(
    'INSERT INTO categories (user_id, name, type, icon, is_default) VALUES (?, ?, ?, ?, 0)'
  ).run(req.userId, name, type, icon || 'default');

  saveToFile();
  res.json({ id: result.lastInsertRowid, user_id: req.userId, name, type, icon: icon || 'default', is_default: 0 });
});

// 更新自定义分类
router.put('/:id', auth, (req, res) => {
  const db = getDB();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  if (cat.is_default) return res.status(403).json({ error: '系统默认分类不可修改' });

  const { name, icon, sort_order } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(name || null, icon || null, sort_order != null ? sort_order : null, req.params.id);

  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  saveToFile();
  res.json(updated);
});

// 删除自定义分类（无记录引用时才可删除）
router.delete('/:id', auth, (req, res) => {
  const db = getDB();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  if (cat.is_default) return res.status(403).json({ error: '系统默认分类不可删除' });

  const refCount = db.prepare('SELECT COUNT(*) as cnt FROM records WHERE category_id = ?').get(req.params.id);
  if (refCount.cnt > 0) {
    return res.status(400).json({ error: '该分类下有记录，无法删除' });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  saveToFile();
  res.json({ success: true });
});

module.exports = router;
