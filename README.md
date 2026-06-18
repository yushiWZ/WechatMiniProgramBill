# 智能记账本

基于微信小程序的个人记账应用，包含前后端和数据持久化存储。

## 技术栈

- **前端**: 微信小程序（原生开发）
- **后端**: Node.js + Express
- **数据库**: SQLite（sql.js，纯 JS 实现，无需额外安装）
- **认证**: JWT + 微信登录

## 项目结构

```
├── miniprogram/          # 微信小程序前端
│   ├── pages/
│   │   ├── index/        # 首页：收支概览、预算进度、记录列表
│   │   ├── statistics/   # 统计：饼图 + 柱状图
│   │   ├── mine/         # 我的：用户信息、菜单入口
│   │   ├── add-record/   # 添加/编辑记账记录
│   │   ├── category/     # 收支分类管理
│   │   └── budget/       # 月度预算设置
│   ├── components/
│   │   └── ec-canvas/    # ECharts 组件（可选，需下载 echarts.js）
│   └── utils/            # API 封装、登录、工具函数
├── backend/              # Node.js 后端
│   ├── routes/           # auth、records、categories、statistics、budgets
│   ├── middleware/        # JWT 认证中间件
│   ├── db.js             # 数据库初始化和封装
│   └── app.js            # Express 入口
```

## 快速开始

### 1. 启动后端

```bash
cd backend
npm install
npm start
```

后端默认运行在 `http://localhost:3000`。

### 2. 配置小程序

1. 打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，选择 `miniprogram/` 目录
3. 使用**测试号**（无需注册，开发者工具可直接生成）
4. 在 `project.config.json` 中填入你的 AppID（测试号会自动生成）
5. 在 `backend/config.js` 中配置 `appId` 和 `appSecret`（测试号可保持默认占位值，会自动模拟登录）

### 3. 开发调试

- 开发者工具中：详情 → 本地设置 → 勾选"不校验合法域名"
- 小程序请求地址为 `http://localhost:3000`，需确保开发工具未开启域名校验

## 功能说明

| 功能 | 说明 |
|------|------|
| 记账 | 选择支出/收入类型、分类、填写金额和日期 |
| 首页 | 展示本月收支汇总、预算进度条、按日期分组的最近记录 |
| 统计 | 分类支出占比图、近6个月收支趋势柱状图 |
| 分类管理 | 系统默认分类 + 自定义分类，支持增删改 |
| 预算设置 | 按月设置预算，实时显示已支出金额和比例 |
| 登录 | 微信一键登录（wx.login） |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 微信登录 |
| GET | /api/records | 获取记录列表 |
| POST | /api/records | 添加记录 |
| PUT | /api/records/:id | 更新记录 |
| DELETE | /api/records/:id | 删除记录 |
| GET | /api/categories | 获取分类 |
| POST | /api/categories | 添加分类 |
| PUT | /api/categories/:id | 更新分类 |
| DELETE | /api/categories/:id | 删除分类 |
| GET | /api/statistics/category-pie | 分类占比数据 |
| GET | /api/statistics/monthly-trend | 月度趋势数据 |
| GET | /api/budgets | 获取预算 |
| POST | /api/budgets | 设置预算 |
| PUT | /api/budgets/:id | 更新预算 |

## 数据库表

- **users**: 用户表（openid、昵称、头像）
- **categories**: 分类表（支出/收入、系统默认/用户自定义）
- **records**: 记账记录表（金额、分类、日期、备注）
- **budgets**: 预算表（月份、金额）

## 注意事项

- 图表使用纯 WXML/CSS 实现，无需额外依赖
- `ec-canvas` 组件为可选模板，如需使用 ECharts 请下载 [echarts-for-weixin](https://github.com/ecomfe/echarts-for-weixin) 的 echarts.js 放入 `components/ec-canvas/` 目录
- 数据库文件 `database.sqlite` 会自动创建在后端目录下
