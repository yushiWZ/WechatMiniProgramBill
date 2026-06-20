/**
 * util.js - 通用工具函数模块
 *
 * 本模块提供记账小程序中常用的工具函数，主要包括：
 * 1. 金额格式化 —— 统一显示两位小数
 * 2. 日期相关 —— 日期标签（今天/昨天/周几）、日期格式化、月份操作
 * 3. 记录分组 —— 将账单记录按日期分组，方便列表页展示
 *
 * 依赖：无外部依赖，仅使用 JavaScript 原生 Date 对象
 */

/**
 * 格式化金额，保留两位小数
 *
 * 用于账单金额的显示，确保所有金额统一显示为 "xx.xx" 格式
 * 例如：10 → "10.00"，3.5 → "3.50"，99.126 → "99.13"
 *
 * @param {number|string} amount - 金额数值（可以是数字或字符串）
 * @returns {string} 格式化后的两位小数金额字符串
 */
function formatAmount(amount) {
  return parseFloat(amount).toFixed(2);
}

/**
 * 生成日期标签文本，用于账单列表的分组标题显示
 *
 * 显示规则：
 * - 当天日期 → 显示 "今天"
 * - 昨天日期 → 显示 "昨天"
 * - 本周内其他日期 → 显示 "MM-DD 周X"（如 "06-18 周三"）
 *
 * @param {string} dateStr - 日期字符串，格式为 "YYYY-MM-DD"
 * @returns {string} 人类可读的日期标签
 */
function formatDateLabel(dateStr) {
  // 获取当前日期作为比较基准
  const today = new Date();
  const date = new Date(dateStr);

  // 将今天和昨天格式化为 "YYYY-MM-DD" 字符串，用于直接比较
  const todayStr = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);  // 日期减 1 得到昨天
  const yesterdayStr = formatDate(yesterday);

  // 优先匹配"今天"和"昨天"这两个最常用的标签
  if (dateStr === todayStr) return '今天';
  if (dateStr === yesterdayStr) return '昨天';

  // 其他日期显示为 "MM-DD 周X" 格式
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const month = date.getMonth() + 1;   // getMonth() 返回 0-11，需要 +1
  const day = date.getDate();
  const weekDay = weekDays[date.getDay()];  // getDay() 返回 0(周日)-6(周六)

  // padStart(2, '0') 确保月份和日期始终为两位数（如 06 而非 6）
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${weekDay}`;
}

/**
 * 将 Date 对象格式化为 "YYYY-MM-DD" 格式的日期字符串
 *
 * 这是一个基础的日期格式化函数，被其他日期相关函数内部调用
 *
 * @param {Date} date - JavaScript Date 对象
 * @returns {string} 格式为 "YYYY-MM-DD" 的字符串，如 "2026-06-20"
 */
function formatDate(date) {
  const y = date.getFullYear();                         // 四位年份
  const m = String(date.getMonth() + 1).padStart(2, '0'); // 月份补零
  const d = String(date.getDate()).padStart(2, '0');      // 日期补零
  return `${y}-${m}-${d}`;
}

/**
 * 获取当前月份字符串
 *
 * 用于初始化账单列表的默认查询月份（打开应用时默认显示当月账单）
 *
 * @returns {string} 格式为 "YYYY-MM" 的月份字符串，如 "2026-06"
 */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 切换月份（向前或向后偏移）
 *
 * 用于账单列表页面左右切换月份的功能：
 * - delta 为 -1 时表示上一个月
 * - delta 为 +1 时表示下一个月
 *
 * 原理：利用 Date 构造函数的自动进位/退位特性，
 * 当月份超出范围时会自动跨年（如 13 月 → 次年 1 月）
 *
 * @param {string} monthStr - 当前月份，格式 "YYYY-MM"
 * @param {number} delta    - 月份偏移量，-1 为上月，+1 为下月
 * @returns {string} 偏移后的月份字符串，格式 "YYYY-MM"
 */
function changeMonth(monthStr, delta) {
  // 拆分年月字符串并转为数字
  const [y, m] = monthStr.split('-').map(Number);
  // 利用 Date 的月份自动进位机制处理跨年情况
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 将月份字符串转为中文显示格式
 *
 * 用于页面标题或选择器中显示，如 "2026-06" → "2026年6月"
 * parseInt 用于去除月份前导零，使显示更自然（"6月" 而非 "06月"）
 *
 * @param {string} monthStr - 月份字符串，格式 "YYYY-MM"
 * @returns {string} 中文格式的月份文本，如 "2026年6月"
 */
function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  return `${y}年${parseInt(m)}月`;
}

/**
 * 将账单记录按日期分组
 *
 * 将扁平的记录数组转换为按日期分组的二维结构，
 * 方便在 wxml 中使用 wx:for 嵌套循环渲染（外层遍历日期组，内层遍历记录）
 *
 * 注意：此函数假设 records 已按 record_date 排序（降序），
 * 相同日期的记录是连续的，因此只需比较相邻记录的日期标签即可分组
 *
 * @param {Array<object>} records - 账单记录数组，每条记录需包含 record_date 字段
 * @returns {Array<{dateLabel: string, records: Array<object>}>}
 *   分组后的数组，每个元素包含：
 *   - dateLabel：日期标签（如 "今天"、"06-18 周三"）
 *   - records：该日期下的所有账单记录
 */
function groupByDate(records) {
  const groups = [];           // 存储分组结果的数组
  let currentLabel = '';       // 当前正在处理的日期标签，用于判断是否需要新建分组

  records.forEach(r => {
    // 将每条记录的日期转换为显示标签
    const label = formatDateLabel(r.record_date);

    if (label !== currentLabel) {
      // 日期标签变化，创建新的分组
      groups.push({ dateLabel: label, records: [r] });
      currentLabel = label;  // 更新当前标签
    } else {
      // 日期标签相同，将记录追加到最后一个分组中
      groups[groups.length - 1].records.push(r);
    }
  });

  return groups;
}

// 导出所有工具函数，供各页面按需引入
module.exports = {
  formatAmount,
  formatDateLabel,
  formatDate,
  getCurrentMonth,
  changeMonth,
  formatMonthLabel,
  groupByDate
};
