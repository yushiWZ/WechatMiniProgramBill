const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let db = null;
const dbPath = path.join(__dirname, config.dbPath);

function wrapDB(sqlDb) {
  const wrapper = {
    _db: sqlDb,

    prepare(sql) {
      const stmt = sqlDb.prepare(sql);
      return {
        _stmt: stmt,

        run(...params) {
          stmt.bind(params);
          stmt.step();
          stmt.reset();
          // 获取 last_insert_rowid
          const idResult = sqlDb.exec('SELECT last_insert_rowid() as id');
          const lastId = idResult.length > 0 ? idResult[0].values[0][0] : 0;
          return { lastInsertRowid: lastId, changes: sqlDb.getRowsModified() };
        },

        get(...params) {
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.reset();
          return row;
        },

        all(...params) {
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.reset();
          return rows;
        },

        free() { stmt.free(); }
      };
    },

    exec(sql) {
      sqlDb.run(sql);
    },

    run(sql, params = []) {
      sqlDb.run(sql, params);
      const idResult = sqlDb.exec('SELECT last_insert_rowid() as id');
      const lastId = idResult.length > 0 ? idResult[0].values[0][0] : 0;
      return { lastInsertRowid: lastId, changes: sqlDb.getRowsModified() };
    },

    pragma(key) {
      sqlDb.run(`PRAGMA ${key}`);
    },

    close() {
      sqlDb.close();
    }
  };

  return wrapper;
}

function saveToFile() {
  if (db && db._db) {
    const data = db._db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

function getDB() {
  if (!db) throw new Error('数据库尚未初始化，请先调用 initDB()');
  return db;
}

async function initDB() {
  const SQL = await initSqlJs();
  let sqlDb;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = wrapDB(sqlDb);

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid VARCHAR(64) UNIQUE NOT NULL,
      nickname VARCHAR(64) DEFAULT '',
      avatar_url VARCHAR(256) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  db.exec('CREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, record_date)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month VARCHAR(7) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      UNIQUE(user_id, month)
    )
  `);

  saveToFile();

  // 种子数据
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories WHERE is_default = 1').get();
  if (count && count.cnt === 0) {
    const insert = db.prepare('INSERT INTO categories (name, type, icon, sort_order, is_default) VALUES (?, ?, ?, ?, 1)');

    const categories = [
      ['餐饮', 'expense', 'food', 1],
      ['交通', 'expense', 'transport', 2],
      ['购物', 'expense', 'shopping', 3],
      ['娱乐', 'expense', 'entertainment', 4],
      ['住房', 'expense', 'house', 5],
      ['医疗', 'expense', 'medical', 6],
      ['其他支出', 'expense', 'other', 7],
      ['工资', 'income', 'salary', 1],
      ['兼职', 'income', 'parttime', 2],
      ['理财', 'income', 'finance', 3],
      ['红包', 'income', 'redpack', 4],
      ['其他收入', 'income', 'other', 5]
    ];

    db.exec('BEGIN');
    for (const cat of categories) {
      insert.run(...cat);
    }
    db.exec('COMMIT');
    insert.free();
    saveToFile();
    console.log('默认分类已初始化');
  }

  console.log('数据库初始化完成');
}

// 优雅退出
process.on('exit', () => saveToFile());
process.on('SIGINT', () => { saveToFile(); process.exit(); });

module.exports = { getDB, initDB, saveToFile };
