/**
 * iconMap.js - 分类图标映射工具
 *
 * 将数据库中的图标标识符映射为 emoji 图标，供各页面统一使用。
 * 数据库 categories 表的 icon 字段存储英文标识（如 'food'），
 * 前端通过本模块将其转换为可视化 emoji。
 */
const iconMap = {
  food: '🍜',
  transport: '🚗',
  shopping: '🛒',
  entertainment: '🎮',
  house: '🏠',
  medical: '💊',
  other: '📦',
  salary: '💰',
  parttime: '💼',
  finance: '📈',
  redpack: '🧧',
  default: '📋'
};
/**
 * 根据数据库图标标识获取对应 emoji
 * @param {string} dbIcon - 数据库 icon 字段值
 * @returns {string} emoji 字符
 */
function getIcon(dbIcon) {
  return iconMap[dbIcon] || '📋';
}
module.exports = { getIcon };
