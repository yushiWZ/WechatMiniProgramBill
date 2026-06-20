/**
 * ============================================================
 * 智能记账本 - 数据库初始化与封装模块
 * ============================================================
 *
 * 本文件负责：
 *   1. 使用 sql.js（SQLite 的 WebAssembly 版本）创建内存数据库
 *   2. 对 sql.js 原生 API 进行封装，提供与 better-sqlite3 相似的操作接口
 *      （prepare → run/get/all、exec、run 等），降低业务代码的耦合度
 *   3. 实现内存数据库到磁盘文件的持久化（saveToFile）
 *   4. 创建所有业务表（users / categories / records / budgets）
 *   5. 插入系统默认分类种子数据
 *   6. 注册进程退出钩子，确保数据不丢失
 *
 * 【架构说明】
 *   sql.js 是纯 JavaScript 的 SQLite 实现，无需编译原生模块，
 *   适合轻量级、快速部署的场景。但它运行在内存中，所有写入操作
 *   仅存在于进程内存，因此需要在每次写操作后调用 saveToFile()
 *   将数据库序列化并写入磁盘文件，以实现数据持久化。
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// 模块级变量，保存封装后的数据库实例
// 初始值为 null，只有在 initDB() 成功执行后才会被赋值
let db = null;

// 数据库文件的绝对路径，由 config.dbPath（相对路径）拼接 backend/ 目录得到
const dbPath = path.join(__dirname, config.dbPath);

/**
 * 封装 sql.js 原生数据库对象，提供更易用的接口
 *
 * sql.js 的原生 API 较为底层（需要手动 bind/step/reset），
 * 本函数将其封装为与 better-sqlite3 类似的同步接口：
 *   - prepare(sql) → { run(), get(), all(), free() }
 *   - exec(sql)    → 执行 DDL 语句
 *   - run(sql, params) → 执行 DML 语句并返回影响行数
 *   - pragma(key)  → 执行 PRAGMA 指令
 *   - close()      → 关闭数据库连接
 *
 * @param {Object} sqlDb - sql.js 返回的原生 Database 实例
 * @returns {Object} 封装后的数据库操作对象
 */
function wrapDB(sqlDb) {
  const wrapper = {
    // 保留原始 sql.js 数据库实例的引用，供 saveToFile() 序列化使用
    _db: sqlDb,

    /**
     * 预编译 SQL 语句，返回一个可多次执行的 Statement 对象
     * 类似于 better-sqlite3 的 db.prepare(sql)
     *
     * @param {string} sql - SQL 模板字符串，使用 ? 作为参数占位符
     * @returns {Object} 包含 run/get/all/free 方法的语句对象
     */
    prepare(sql) {
      // 调用 sql.js 的 prepare 方法预编译 SQL
      const stmt = sqlDb.prepare(sql);
      return {
        // 保留原始 Statement 引用，供内部使用
        _stmt: stmt,

        /**
         * 执行写操作（INSERT / UPDATE / DELETE）
         *
         * 执行流程：
         *   1. bind() —— 将参数绑定到预编译语句的 ? 占位符
         *   2. step() —— 执行一次语句（对于写操作只需执行一次）
         *   3. reset() —— 重置语句状态，以便下次复用
         *   4. 通过 last_insert_rowid() 获取最后插入的行 ID
         *   5. 通过 getRowsModified() 获取受影响的行数
         *
         * @param {...*} params - 按顺序传入的 SQL 参数值
         * @returns {{ lastInsertRowid: number, changes: number }}
         */
        run(...params) {
          stmt.bind(params);
          stmt.step();
          stmt.reset();
          // 通过执行 SQLite 内置函数获取最后插入的行 ID
          const idResult = sqlDb.exec('SELECT last_insert_rowid() as id');
          const lastId = idResult.length > 0 ? idResult[0].values[0][0] : 0;
          return { lastInsertRowid: lastId, changes: sqlDb.getRowsModified() };
        },

        /**
         * 查询单行数据（SELECT ... 返回第一条结果）
         *
         * @param {...*} params - 按顺序传入的 SQL 参数值
         * @returns {Object|undefined} 以列名为 key 的对象，无结果时返回 undefined
         */
        get(...params) {
          stmt.bind(params);
          // step() 返回 true 表示有结果行，getAsObject() 将当前行转为 {列名: 值} 对象
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.reset();
          return row;
        },

        /**
         * 查询多行数据（SELECT ... 返回所有结果）
         *
         * @param {...*} params - 按顺序传入的 SQL 参数值
         * @returns {Object[]} 对象数组，每个对象代表一行结果
         */
        all(...params) {
          stmt.bind(params);
          const rows = [];
          // 循环调用 step() 遍历所有结果行
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.reset();
          return rows;
        },

        /**
         * 释放预编译语句占用的内存资源
         * 在不再需要该语句时务必调用，防止内存泄漏
         */
        free() { stmt.free(); }
      };
    },

    /**
     * 直接执行 SQL 语句（不支持参数绑定）
     * 主要用于执行 DDL（CREATE TABLE、CREATE INDEX 等）和控制语句（BEGIN、COMMIT）
     *
     * @param {string} sql - 要执行的 SQL 语句字符串
     */
    exec(sql) {
      sqlDb.run(sql);
    },

    /**
     * 执行带参数的写操作 SQL
     * 与 prepare().run() 功能类似，但无需手动管理 Statement 生命周期
     *
     * @param {string} sql - SQL 语句，使用 ? 作为参数占位符
     * @param {Array} params - 参数数组，默认空数组
     * @returns {{ lastInsertRowid: number, changes: number }}
     */
    run(sql, params = []) {
      sqlDb.run(sql, params);
      const idResult = sqlDb.exec('SELECT last_insert_rowid() as id');
      const lastId = idResult.length > 0 ? idResult[0].values[0][0] : 0;
      return { lastInsertRowid: lastId, changes: sqlDb.getRowsModified() };
    },

    /**
     * 执行 SQLite PRAGMA 指令
     * 可用于设置/查询数据库配置，如 foreign_keys、journal_mode 等
     *
     * @param {string} key - PRAGMA 指令内容，如 'foreign_keys = ON'
     */
    pragma(key) {
      sqlDb.run(`PRAGMA ${key}`);
    },

    /**
     * 关闭数据库连接，释放所有资源
     * 关闭后不可再执行任何数据库操作
     */
    close() {
      sqlDb.close();
    }
  };

  return wrapper;
}

/**
 * 将内存中的数据库序列化并写入磁盘文件，实现数据持久化
 *
 * 【重要】由于 sql.js 运行在内存中，所有写操作（INSERT/UPDATE/DELETE）
 * 仅存在于进程内存。若进程崩溃或重启而未调用此函数，数据将丢失。
 * 因此每个涉及写操作的路由处理函数最后都必须调用 saveToFile()。
 *
 * 序列化过程：调用 sql.js 的 export() 方法将整个数据库导出为 Uint8Array，
 * 然后通过 fs.writeFileSync 同步写入磁盘文件。
 */
function saveToFile() {
  if (db && db._db) {
    const data = db._db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

/**
 * 获取已初始化的数据库实例
 *
 * 各路由模块通过此函数获取数据库连接，执行查询和写入操作。
 * 如果在 initDB() 完成之前调用，会抛出错误以提醒开发者。
 *
 * @returns {Object} 封装后的数据库操作对象（由 wrapDB 返回）
 * @throws {Error} 数据库尚未初始化时抛出
 */
function getDB() {
  if (!db) throw new Error('数据库尚未初始化，请先调用 initDB()');
  return db;
}

/**
 * 异步初始化数据库
 *
 * 执行流程：
 *   1. 加载 sql.js 的 WebAssembly 模块
 *   2. 如果磁盘上已有数据库文件，则读取并加载到内存中；否则创建全新的空数据库
 *   3. 对原生数据库对象进行封装（wrapDB）
 *   4. 执行建表语句（CREATE TABLE IF NOT EXISTS），确保所有业务表存在
 *   5. 创建必要的索引以优化查询性能
 *   6. 如果系统默认分类不存在，则插入种子数据
 *   7. 将数据库持久化到磁盘
 *
 * @returns {Promise<void>}
 */
async function initDB() {
  // 加载 sql.js 的 WASM 模块（异步操作），返回 SQL.js 的工厂对象
  const SQL = await initSqlJs();
  let sqlDb;

  // 判断磁盘上是否已存在数据库文件
  if (fs.existsSync(dbPath)) {
    // 已存在：读取文件内容到内存，用于恢复之前的数据库状态
    // 这样服务重启后数据不会丢失
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    // 不存在：创建全新的空数据库（仅存在于内存中）
    sqlDb = new SQL.Database();
  }

  // 对原生 sql.js 数据库进行封装，提供友好的操作接口
  db = wrapDB(sqlDb);

  // ========== 建表语句 ==========

  // 用户表（users）
  // 存储通过微信小程序登录的用户信息
  // - openid: 微信用户唯一标识，用于关联用户与账单数据
  // - nickname: 用户昵称（可选，预留扩展）
  // - avatar_url: 用户头像 URL（可选，预留扩展）
  // - created_at: 用户创建时间，默认当前时间
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid VARCHAR(64) UNIQUE NOT NULL,
      nickname VARCHAR(64) DEFAULT '',
      avatar_url VARCHAR(256) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 分类表（categories）
  // 管理账单的收支分类，分为系统默认分类和用户自定义分类
  // - user_id: 0 表示系统默认分类（所有用户可见），非 0 表示用户自定义分类
  // - name: 分类名称，如"餐饮"、"交通"等
  // - type: 分类类型，限制为 'income'（收入）或 'expense'（支出）
  // - icon: 分类图标标识，前端根据此值显示对应图标
  // - sort_order: 排序权重，数值越小排越前
  // - is_default: 是否为系统默认分类（1=是，0=否），默认分类不可修改/删除
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 0,
      name VARCHAR(32) NOT NULL,
      type VARCHAR(8) NOT NULL CHECK(type IN ('income','expense')),
      icon VARCHAR(32) DEFAULT 'default',
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0
    )
  `);

  // 账单记录表（records）
  // 存储用户的每一笔记账记录，是系统的核心业务表
  // - user_id: 所属用户 ID，外键关联 users 表
  // - category_id: 所属分类 ID，外键关联 categories 表（可为 NULL，表示未分类）
  // - type: 收支类型，'income' 或 'expense'
  // - amount: 金额，DECIMAL(10,2) 最大 99999999.99
  // - note: 备注信息，最多 256 字符
  // - record_date: 记账日期（格式 YYYY-MM-DD），用于按月统计
  // - created_at: 记录创建时间，用于排序和审计
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      type VARCHAR(8) NOT NULL CHECK(type IN ('income','expense')),
      amount DECIMAL(10,2) NOT NULL,
      note VARCHAR(256) DEFAULT '',
      record_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为账单记录表创建复合索引
  // 优化按用户 ID + 记账日期查询的性能
  // 常见场景：获取某用户某月的所有账单记录
  db.exec('CREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, record_date)');

  // 预算表（budgets）
  // 存储用户每月的支出预算设置
  // - user_id: 所属用户 ID
  // - month: 月份（格式 YYYY-MM，如 "2024-06"）
  // - amount: 预算金额
  // - UNIQUE(user_id, month): 同一用户同一月份只能有一条预算记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month VARCHAR(7) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      UNIQUE(user_id, month)
    )
  `);

  // 建表完成后立即持久化到磁盘，确保表结构不会因进程意外退出而丢失
  saveToFile();

  // ========== 种子数据：系统默认分类 ==========

  // 查询是否已有系统默认分类存在
  // 通过 is_default = 1 条件判断，避免重复插入
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories WHERE is_default = 1').get();
  if (count && count.cnt === 0) {
    // 预编译插入语句，循环插入所有默认分类
    // is_default 固定为 1，表示这些是系统内置分类
    const insert = db.prepare('INSERT INTO categories (name, type, icon, sort_order, is_default) VALUES (?, ?, ?, ?, 1)');

    // 默认分类列表：[名称, 类型, 图标标识, 排序权重]
    const categories = [
      // --- 支出分类（7 个）---
      ['餐饮', 'expense', 'food', 1],         // 日常饮食消费
      ['交通', 'expense', 'transport', 2],     // 出行交通费用
      ['购物', 'expense', 'shopping', 3],      // 网购、实体店购物
      ['娱乐', 'expense', 'entertainment', 4], // 娱乐休闲消费
      ['住房', 'expense', 'house', 5],         // 房租、物业、水电等
      ['医疗', 'expense', 'medical', 6],       // 看病、买药、体检
      ['其他支出', 'expense', 'other', 7],     // 其他未分类支出
      // --- 收入分类（5 个）---
      ['工资', 'income', 'salary', 1],         // 工资薪金收入
      ['兼职', 'income', 'parttime', 2],       // 兼职、副业收入
      ['理财', 'income', 'finance', 3],        // 投资、理财收益
      ['红包', 'income', 'redpack', 4],        // 红包、礼金收入
      ['其他收入', 'income', 'other', 5]       // 其他未分类收入
    ];

    // 使用事务批量插入，提升性能并保证原子性
    // BEGIN → 逐条插入 → COMMIT，如果中间出错不会部分插入
    db.exec('BEGIN');
    for (const cat of categories) {
      insert.run(...cat);
    }
    db.exec('COMMIT');
    insert.free();  // 释放预编译语句资源
    saveToFile();   // 将种子数据持久化到磁盘
    console.log('默认分类已初始化');
  }

  console.log('数据库初始化完成');
}

// ========== 进程退出钩子：确保数据安全落盘 ==========

// 监听 Node.js 进程正常退出事件（process.exit() 或自然结束）
// 在退出前将内存数据库保存到磁盘文件
process.on('exit', () => saveToFile());

// 监听 SIGINT 信号（通常是用户按 Ctrl+C 终止进程）
// 先保存数据，再手动退出进程
process.on('SIGINT', () => { saveToFile(); process.exit(); });

// 导出三个核心函数供其他模块使用
module.exports = { getDB, initDB, saveToFile };
