import Database from 'better-sqlite3';
import path from 'path';

// Path to the generated dashboard.db 
// We are assuming it sits one level up from the dashboard-ui folder
const dbPath = path.resolve(process.cwd(), '../dashboard.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: true });
    // Optimize SQLite for read performance
    db.pragma('journal_mode = WAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
  }
  return db;
}
