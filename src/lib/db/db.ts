import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient, Client } from '@libsql/client';


const DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'mehsang.db');

// SHA-256 password hashing helper
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Database Wrapper interface to support both local sqlite3 and remote libsql/client
export interface AppDatabase {
  get(sql: string, ...args: any[]): Promise<any>;
  all(sql: string, ...args: any[]): Promise<any[]>;
  run(sql: string, ...args: any[]): Promise<{ lastID?: number; changes?: number }>;
  exec(sql: string): Promise<void>;
  prepare(sql: string): Promise<{ run: (...args: any[]) => Promise<any>; finalize: () => Promise<void> }>;
}

class LibsqlDatabaseWrapper implements AppDatabase {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async get(sql: string, ...args: any[]): Promise<any> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await this.client.execute({ sql, args: params });
    // libSQL returns rows as objects (key-value pairs)
    return res.rows[0];
  }

  async all(sql: string, ...args: any[]): Promise<any[]> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await this.client.execute({ sql, args: params });
    return res.rows as any[];
  }

  async run(sql: string, ...args: any[]): Promise<{ lastID?: number; changes?: number }> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await this.client.execute({ sql, args: params });
    return {
      lastID: res.lastInsertRowid ? Number(res.lastInsertRowid) : undefined,
      changes: res.rowsAffected,
    };
  }

  async exec(sql: string): Promise<void> {
    // Split multi-statement SQL by semicolon, filtering out empty queries
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await this.client.execute(stmt);
    }
  }

  async prepare(sql: string): Promise<{ run: (...args: any[]) => Promise<any>; finalize: () => Promise<void> }> {
    const client = this.client;
    return {
      run: async (...args: any[]) => {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const res = await client.execute({ sql, args: params });
        return {
          lastID: res.lastInsertRowid ? Number(res.lastInsertRowid) : undefined,
          changes: res.rowsAffected,
        };
      },
      finalize: async () => {},
    };
  }
}

class SqliteDatabaseWrapper implements AppDatabase {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get(sql: string, ...args: any[]): Promise<any> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return this.db.get(sql, params);
  }

  async all(sql: string, ...args: any[]): Promise<any[]> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return this.db.all(sql, params);
  }

  async run(sql: string, ...args: any[]): Promise<{ lastID?: number; changes?: number }> {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return this.db.run(sql, params);
  }

  async exec(sql: string): Promise<void> {
    return this.db.exec(sql);
  }

  async prepare(sql: string): Promise<{ run: (...args: any[]) => Promise<any>; finalize: () => Promise<void> }> {
    const stmt = await this.db.prepare(sql);
    return {
      run: async (...args: any[]) => {
        return stmt.run(...args);
      },
      finalize: async () => {
        await stmt.finalize();
      },
    };
  }
}

let dbInstance: AppDatabase | null = null;

export async function getDb(): Promise<AppDatabase> {
  if (dbInstance) return dbInstance;

  if (process.env.TURSO_DATABASE_URL) {
    console.log('Connecting to Turso Cloud Database...');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    dbInstance = new LibsqlDatabaseWrapper(client);
  } else {
    console.log('Connecting to local SQLite database...');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');

    const sqliteDb = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    try {
      await sqliteDb.run('PRAGMA foreign_keys = ON');
    } catch (err) {
      console.warn('Could not enable foreign keys pragma:', err);
    }

    dbInstance = new SqliteDatabaseWrapper(sqliteDb);
  }

  // Initialize Schema and Seed data if necessary
  await initializeSchema(dbInstance);

  return dbInstance;
}

async function initializeSchema(db: AppDatabase) {
  const schemaPath = path.resolve(process.cwd(), 'src/lib/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schemaSql);
  }

  // Add column migrations dynamically if they don't exist
  try {
    await db.run("ALTER TABLE images ADD COLUMN no_of_hands TEXT");
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await db.run("ALTER TABLE reapprove_requests ADD COLUMN original_no_of_hands TEXT");
  } catch (e) {}
  try {
    await db.run("ALTER TABLE reapprove_requests ADD COLUMN proposed_no_of_hands TEXT");
  } catch (e) {}

  // Check if default users exist, if not, create them
  console.log('Seeding admin and reviewer accounts...');

  await db.run(
    'INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    'admin',
    hashPassword('admin1020'),
    'ADMIN'
  );

  await db.run(
    'INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    'admin2',
    hashPassword('admin1020'),
    'ADMIN'
  );

  await db.run(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    'reviewer',
    hashPassword('reviewer'),
    'REVIEWER'
  );

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
      { key: 'active_ai_model', value: 'gpt-4o-mini' },
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
