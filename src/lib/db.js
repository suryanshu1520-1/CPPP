/**
 * Safe database accessor.
 * Falls back gracefully when better-sqlite3 is not available
 * (e.g., Netlify serverless environment).
 */

let Database;
let db = null;
let isAvailable = true;

try {
  Database = require('better-sqlite3');
} catch (e) {
  // better-sqlite3 native module not available
  // (Netlify serverless, missing build tools, etc.)
  console.warn('better-sqlite3 not available, database features will use mock fallback:', e.message);
  Database = null;
  isAvailable = false;
}

export function getDb() {
  if (!isAvailable || !Database) {
    throw new Error('DATABASE_UNAVAILABLE');
  }

  if (!db) {
    // Only resolve path if DB is available
    const path = require('path');
    const dbPath = path.resolve(process.cwd(), '../dashboard.db');
    db = new Database(dbPath, { readonly: true });
    // Optimize SQLite for read performance
    db.pragma('journal_mode = WAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
  }
  return db;
}

export function getWritableDb() {
  if (!isAvailable || !Database) {
    throw new Error('DATABASE_UNAVAILABLE');
  }
  const path = require('path');
  const dbPath = path.resolve(process.cwd(), '../dashboard.db');
  const writeDb = new Database(dbPath, { readonly: false });
  writeDb.pragma('journal_mode = WAL');
  writeDb.pragma('synchronous = NORMAL');
  return writeDb;
}