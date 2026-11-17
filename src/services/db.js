/**
 * 数据库初始化与访问层
 * 使用 SQLite 存储新闻条目、报告、采集日志
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'chb_news.db');

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      link TEXT,
      description TEXT,
      source_id TEXT,
      source_name TEXT,
      source_cat TEXT,
      lang TEXT,
      pub_date TEXT,
      fetch_date TEXT NOT NULL,
      tier TEXT DEFAULT 'C',
      tier_reason TEXT,
      status TEXT DEFAULT 'active',
      ai_researched INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT UNIQUE NOT NULL,
      total_items INTEGER DEFAULT 0,
      a_count INTEGER DEFAULT 0,
      b_count INTEGER DEFAULT 0,
      c_count INTEGER DEFAULT 0,
      x_count INTEGER DEFAULT 0,
      summary TEXT,
      generated_at TEXT DEFAULT (datetime('now','localtime')),
      content TEXT
    );

    CREATE TABLE IF NOT EXISTS fetch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,
      source_id TEXT,
      source_name TEXT,
      status TEXT,
      items_fetched INTEGER DEFAULT 0,
      items_matched INTEGER DEFAULT 0,
      error TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS source_status (
      source_id TEXT PRIMARY KEY,
      last_check TEXT,
      last_ok TEXT,
      consecutive_fails INTEGER DEFAULT 0,
      total_fetches INTEGER DEFAULT 0,
      total_hits INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_news_pub_date ON news_items(pub_date);
    CREATE INDEX IF NOT EXISTS idx_news_tier ON news_items(tier);
    CREATE INDEX IF NOT EXISTS idx_news_status ON news_items(status);
    CREATE INDEX IF NOT EXISTS idx_news_hash ON news_items(hash);
  `);
}

module.exports = { getDB };
