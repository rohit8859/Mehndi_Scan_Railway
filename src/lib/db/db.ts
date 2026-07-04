import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'mehsang.db');
let dbInstance: Database | null = null;

// SHA-256 password hashing helper
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  // Ensure database directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Open database connection
  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // Enable foreign keys
  await dbInstance.run('PRAGMA foreign_keys = ON');

  // Initialize Schema
  await initializeSchema(dbInstance);

  return dbInstance;
}

async function initializeSchema(db: Database) {
  const schemaPath = path.resolve(process.cwd(), 'src/lib/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    // Run schema commands
    // sqlite's exec allows executing multiple queries separated by semicolons
    await db.exec(schemaSql);
  }

  // Check if default users exist, if not, create them
  console.log('Seeding admin and reviewer accounts...');
  
  // Create admin user: username=admin, password=admin
  await db.run(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    'admin',
    hashPassword('admin'),
    'ADMIN'
  );

  // Create reviewer user: username=reviewer, password=reviewer
  await db.run(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    'reviewer',
    hashPassword('reviewer'),
    'REVIEWER'
  );

  // Create reviewer1 to reviewer10 accounts
  for (let i = 1; i <= 10; i++) {
    await db.run(
      'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      `reviewer${i}`,
      hashPassword(`reviewer${i}`),
      'REVIEWER'
    );
  }

  // Seed default settings if empty
  const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount?.count === 0) {
    const defaultSettings = [
      { key: 'gdrive_incoming_folder', value: 'Incoming Images' },
      { key: 'gdrive_verified_folder', value: 'Verified Images' },
      { key: 'gdrive_rejected_folder', value: 'Rejected Images' },
      { key: 'active_ai_model', value: 'gpt-4o-mini' }, // gpt-4o-mini, gpt-4o, gemini-1.5-flash
      { key: 'openai_api_key', value: process.env.OPENAI_API_KEY || '' },
      { key: 'google_spreadsheet_id', value: '' },
      { key: 'google_sheet_name', value: 'Sheet1' },
      { key: 'auto_approve_enabled', value: 'false' },
      { key: 'auto_approve_threshold', value: '95' },
    ];

    for (const setting of defaultSettings) {
      await db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        setting.key,
        setting.value
      );
    }
  }
}
