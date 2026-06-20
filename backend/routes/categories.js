/**
 * ============================================================
 * 智能记账本 - 分类管理路由
 * ============================================================
 *
 * 本文件实现账单分类的管理功能，支持系统默认分类和用户自定义分类。
 *
 * 【分类体系说明】
 *   - 系统默认分类（is_default = 1, user_id = 0）：
 *     在数据库初始化时预置的通用分类（如餐饮、交通、工资等），
 *     所有用户共享，不可修改或删除。
 *   - 用户自定义分类（is_default = 0, user_id = 用户ID）：
 *     用户根据需要自行创建的个性化分类，可修改和删除。
 *
 * 【接口列表】
 *   GET    /api/categories       - 获取分类列表（系统默认 + 当前用户自定义）
 *   POST   /api/categories       - 新增用户自定义分类
 *   PUT    /api/categories/:id   - 修改用户自定义分类
 *   DELETE /api/categories/:id   - 删除用户自定义分类（需无记录引用）
 *
 * 【安全设计】
 *   - 系统默认分类受到保护，不可通过接口修改或删除（返回 403）
 *   - 删除分类前检查是否有账单记录引用该分类，有则拒绝删除
 *   - 用户只能查看和操作自己的自定义分类 + 系统默认分类
 */

const express = require('express');
const auth = require('../middleware/auth');
const { getDB, saveToFile } = require('../db');

const router = express.Router();

/**
 * GET /api/categories
 * 获取分类列表（系统默认 + 用户自定义）
 *
 * 【查询参数】（Query String）
 *   - type: string (可选)
 *     按类型筛选分类，可选值：'income'（收入）或 'expense'（支出）
 *     不传则返回所有类型的分类
 *
 * 【响应数据】（JSON Array）
 *   分类对象数组，每个对象包含：
 *   { id, user_id, name, type, icon, sort_order, is_default }
 *
 * 【SQL 逻辑说明】
 *   WHERE (user_id = 0 OR user_id = ?)
 *     - user_id = 0：获取系统默认分类（所有用户可见）
 *     - user_id = ?：获取当前登录用户自己创建的自定义分类
 *     两者取并集，确保用户既能看到公共分类，也能看到自己的专属分类
 *
 *   ORDER BY is_default DESC, sort_order ASC, id ASC
 *     - is_default DESC：系统默认分类排在前面（1 > 0）
 *     - sort_order ASC：同一组内按排序权重升序
 *     - id ASC：排序权重相同时按 ID 升序，保证稳定的排序结果
 */
router.get('/', auth, (req, res) => {
  const db = getDB();
  const { type } = req.query;

  // 基础查询：获取系统默认分类和当前用户的自定义分类
  let sql = 'SELECT * FROM categories WHERE (user_id = 0 OR user_id = ?)';
  const params = [req.userId];

  // 如果指定了类型筛选，追加 AND 条件
  // 同样通过 includes() 校验防止非法值
  if (type && ['income', 'expense'].includes(type)) {
    sql += ' AND type = ?';
    params.push(type);
  }

  // 追加排序规则
  sql += ' ORDER BY is_default DESC, sort_order ASC, id ASC';
  const categories = db.prepare(sql).all(...params);
  res.json(categories);
});

/**
 * POST /api/categories
 * 新增用户自定义分类
 *
 * 【请求参数】（JSON Body）
 *   - name: string (必填)
 *     分类名称，最多 32 字符
 *   - type: string (必填)
 *     分类类型，'income'（收入）或 'expense'（支出）
 *   - icon: string (可选，默认 'default')
 *     分类图标标识
 *
 * 【响应数据】（JSON）
 *   新创建的分类对象，包含自动生成的 id
 *
 * 【错误码】
 *   - 400: 缺少必填字段 / 类型值无效
 *
 * 【设计说明】
 *   - user_id 从 req.userId 获取（认证中间件注入），而非客户端传入
 *   - is_default 固定为 0，用户创建的永远是自定义分类
 */
router.post('/', auth, (req, res) => {
  const { name, type, icon } = req.body;

  // 必填字段校验
  if (!name || !type) {
    return res.status(400).json({ error: '名称和类型不能为空' });
  }

  // type 值合法性校验
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: '类型无效' });
  }

  const db = getDB();

  // 插入新分类记录
  // user_id 使用当前登录用户的 ID
  // is_default 固定为 0（用户自定义分类）
  const result = db.prepare(
    'INSERT INTO categories (user_id, name, type, icon, is_default) VALUES (?, ?, ?, ?, 0)'
  ).run(req.userId, name, type, icon || 'default');

  // 写操作后持久化到磁盘
  saveToFile();

  // 返回完整的分类对象（包括自动生成的 id）
  res.json({ id: result.lastInsertRowid, user_id: req.userId, name, type, icon: icon || 'default', is_default: 0 });
});

/**
 * PUT /api/categories/:id
 * 修改用户自定义分类
 *
 * 【路径参数】
 *   - id: number
 *     要修改的分类 ID
 *
 * 【请求参数】（JSON Body，均可选）
 *   - name: string       - 新名称
 *   - icon: string       - 新图标
 *   - sort_order: number - 新排序权重
 *
 * 【响应数据】（JSON）
 *   修改后的分类对象
 *
 * 【错误码】
 *   - 403: 尝试修改系统默认分类（受保护，不允许修改）
 *   - 404: 分类不存在或不属于当前用户
 *
 * 【SQL 逻辑说明】
 *   使用 COALESCE(?, 原字段) 实现部分更新，同 records 路由
 */
router.put('/:id', auth, (req, res) => {
  const db = getDB();

  // 查询目标分类并验证归属（只能修改自己的分类）
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!cat) return res.status(404).json({ error: '分类不存在' });

  // 系统默认分类保护：is_default = 1 的分类不允许修改
  // 返回 403 Forbidden，表示权限不足
  if (cat.is_default) return res.status(403).json({ error: '系统默认分类不可修改' });

  // 从请求体提取要更新的字段
  const { name, icon, sort_order } = req.body;

  // 使用 COALESCE 实现部分更新
  // sort_order 使用 != null 判断（而非 ||），因为 0 是合法的排序值
  db.prepare('UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(name || null, icon || null, sort_order != null ? sort_order : null, req.params.id);

  // 查询更新后的完整分类
  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);

  // 写操作后持久化
  saveToFile();
  res.json(updated);
});

/**
 * DELETE /api/categories/:id
 * 删除用户自定义分类
 *
 * 【路径参数】
 *   - id: number
 *     要删除的分类 ID
 *
 * 【响应数据】（JSON）
 *   { success: true }
 *
 * 【错误码】
 *   - 400: 该分类下有账单记录引用，无法删除
 *   - 403: 尝试删除系统默认分类（受保护）
 *   - 404: 分类不存在或不属于当前用户
 *
 * 【安全设计】
 *   - 系统默认分类不可删除（与修改接口相同的保护逻辑）
 *   - 删除前检查 records 表是否有引用该分类的记录
 *     如果有引用则拒绝删除，避免产生孤立的 category_id 引用
 *     （前端应提示用户先转移相关记录到其他分类）
 */
router.delete('/:id', auth, (req, res) => {
  const db = getDB();

  // 查询目标分类并验证归属
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!cat) return res.status(404).json({ error: '分类不存在' });

  // 系统默认分类保护
  if (cat.is_default) return res.status(403).json({ error: '系统默认分类不可删除' });

  // 检查是否有账单记录引用了该分类
  // COUNT(*) 统计引用数量，大于 0 则拒绝删除
  const refCount = db.prepare('SELECT COUNT(*) as cnt FROM records WHERE category_id = ?').get(req.params.id);
  if (refCount.cnt > 0) {
    return res.status(400).json({ error: '该分类下有记录，无法删除' });
  }

  // 执行删除
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);

  // 写操作后持久化
  saveToFile();
  res.json({ success: true });
});

module.exports = router;
