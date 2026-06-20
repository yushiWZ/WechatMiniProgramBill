/**
 * ============================================================
 * 智能记账本 - 统计接口路由
 * ============================================================
 *
 * 本文件提供数据分析和统计图表所需的接口，供前端图表组件调用。
 * 所有接口均需 JWT 认证。
 *
 * 【接口列表】
 *   GET /api/statistics/category-pie    - 分类占比饼图数据（按分类汇总金额和百分比）
 *   GET /api/statistics/monthly-trend   - 月度收支趋势折线图数据
 *
 * 【用途】
 *   - category-pie 接口数据用于渲染饼图（如 ECharts / F2），展示各分类的支出/收入占比
 *   - monthly-trend 接口数据用于渲染折线图或柱状图，展示近几个月的收支变化趋势
 */

const express = require('express');
const auth = require('../middleware/auth');
const { getDB } = require('../db');

const router = express.Router();

/**
 * GET /api/statistics/category-pie
 * 获取分类占比饼图数据
 *
 * 【查询参数】（Query String）
 *   - month: string (必填)
 *     统计月份，格式 "YYYY-MM"，如 "2024-06"
 *
 * 【响应数据】（JSON）
 *   - list: Array
 *     每个分类的汇总数据：
 *     {
 *       categoryName: string,   // 分类名称
 *       categoryIcon: string,   // 分类图标
 *       type: string,           // 收支类型 ('income'/'expense')
 *       totalAmount: number,    // 该分类的金额合计
 *       percentage: number      // 占总支出的百分比（0-100 整数）
 *     }
 *   - total: number
 *     所有分类的金额总计
 *
 * 【错误码】
 *   - 400: 缺少 month 参数
 *
 * 【SQL 逻辑说明】
 *   SELECT c.name, c.icon, c.type, SUM(r.amount) as totalAmount
 *   FROM records r
 *   LEFT JOIN categories c ON r.category_id = c.id
 *   WHERE r.user_id = ? AND strftime('%Y-%m', r.record_date) = ?
 *   GROUP BY r.category_id
 *   ORDER BY totalAmount DESC
 *
 *   - LEFT JOIN：关联分类表获取分类名称和图标
 *   - WHERE：筛选当前用户指定月份的记录
 *   - GROUP BY category_id：按分类分组，同一分类的记录合并为一行
 *   - SUM(amount)：计算每个分类的金额合计
 *   - ORDER BY totalAmount DESC：按金额降序排列，金额最多的排前面
 *
 *   百分比计算在 JavaScript 层完成：
 *   percentage = (该分类金额 / 总金额) * 100，取整
 */
router.get('/category-pie', auth, (req, res) => {
  const db = getDB();
  const { month } = req.query;

  // month 是必填参数，缺少时返回 400 错误
  if (!month) return res.status(400).json({ error: '缺少month参数' });

  // 执行分组聚合查询，按分类汇总指定月份的金额
  const rows = db.prepare(`
    SELECT c.name as categoryName, c.icon as categoryIcon, c.type, SUM(r.amount) as totalAmount
    FROM records r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.user_id = ? AND strftime('%Y-%m', r.record_date) = ?
    GROUP BY r.category_id
    ORDER BY totalAmount DESC
  `).all(req.userId, month);

  // 计算所有分类的金额总计（grand total）
  // 用于后续计算每个分类的占比百分比
  const grandTotal = rows.reduce((sum, r) => sum + r.totalAmount, 0);

  // 在 JavaScript 层计算每个分类的百分比
  // Math.round() 取整，grandTotal 为 0 时百分比统一返回 0（防止除以 0）
  const list = rows.map(r => ({
    ...r,
    percentage: grandTotal > 0 ? Math.round((r.totalAmount / grandTotal) * 100) : 0
  }));

  // 返回带有百分比的分类列表和总计
  res.json({ list, total: grandTotal });
});

/**
 * GET /api/statistics/monthly-trend
 * 获取月度收支趋势数据
 *
 * 【查询参数】（Query String）
 *   - months: number (可选，默认 6)
 *     统计最近几个月的数据，如 6 表示最近 6 个月
 *
 * 【响应数据】（JSON）
 *   - list: Array
 *     每月汇总数据：
 *     {
 *       month: string,    // 月份 "YYYY-MM"
 *       income: number,   // 当月收入合计
 *       expense: number   // 当月支出合计
 *     }
 *
 * 【SQL 逻辑说明】
 *   SELECT
 *     strftime('%Y-%m', record_date) as month,
 *     COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
 *     COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
 *   FROM records
 *   WHERE user_id = ?
 *     AND record_date >= date('now', '-N months', 'start of month')
 *   GROUP BY month
 *   ORDER BY month ASC
 *
 *   - strftime('%Y-%m', record_date)：将日期转为"年-月"格式，作为分组键
 *   - CASE WHEN 条件聚合：分别计算每月的收入和支出合计（同 records 路由的 sumSql）
 *   - date('now', '-N months', 'start of month')：
 *     SQLite 日期函数，计算 N 个月前的月初日期
 *     例如 months=6 时，筛选从 6 个月前的 1 号开始的所有记录
 *   - GROUP BY month：按月分组
 *   - ORDER BY month ASC：按时间升序排列，方便前端绘制趋势图
 *
 *   注意：参数 months 需要减 1 后传入 SQL
 *   因为"最近 6 个月"应包含当前月，所以实际偏移量为 5 个月
 *   例如：当前 6 月，查最近 6 个月 → 从 1 月开始 → date('now', '-5 months', 'start of month')
 */
router.get('/monthly-trend', auth, (req, res) => {
  const db = getDB();

  // months 参数默认值为 6（最近 6 个月）
  const { months = 6 } = req.query;

  // 执行按月分组的收支聚合查询
  // parseInt(months) - 1：将"月数"转为 SQL 偏移量（详见上方 SQL 注释）
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

  // 返回月度趋势数据列表
  res.json({ list: rows });
});

module.exports = router;
