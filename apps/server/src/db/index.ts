import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { migrate } from './migrations';

export function openDatabase(dataDir: string): DatabaseSync {
  // Handle in-memory database for tests
  if (dataDir === ':memory:') {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    migrate(db);
    return db;
  }

  // Create data directory if it doesn't exist
  mkdirSync(dataDir, { recursive: true });

  // Open the database file
  const dbPath = `${dataDir}/coolify-control.db`;
  const db = new DatabaseSync(dbPath);

  // Set pragmas
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  // Run migrations
  migrate(db);

  return db;
}
