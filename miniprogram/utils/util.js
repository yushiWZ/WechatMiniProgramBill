// 格式化金额
function formatAmount(amount) {
  return parseFloat(amount).toFixed(2);
}

// 格式化日期标签
function formatDateLabel(dateStr) {
  const today = new Date();
  const date = new Date(dateStr);
  const todayStr = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  if (dateStr === todayStr) return '今天';
  if (dateStr === yesterdayStr) return '昨天';

  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDay = weekDays[date.getDay()];
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${weekDay}`;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 获取当前月份 YYYY-MM
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 切换月份
function changeMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// 月份显示文本
function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  return `${y}年${parseInt(m)}月`;
}

// 按日期分组记录
function groupByDate(records) {
  const groups = [];
  let currentLabel = '';
  records.forEach(r => {
    const label = formatDateLabel(r.record_date);
    if (label !== currentLabel) {
      groups.push({ dateLabel: label, records: [r] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].records.push(r);
    }
  });
  return groups;
}

module.exports = {
  formatAmount,
  formatDateLabel,
  formatDate,
  getCurrentMonth,
  changeMonth,
  formatMonthLabel,
  groupByDate
};
