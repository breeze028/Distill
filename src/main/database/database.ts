import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from '@main/logging/logger';

export type SqliteDatabase = Database.Database;

export class DatabaseManager {
  private db: SqliteDatabase | null = null;

  constructor(
    private readonly databasePath = process.env.DISTILL_DB_PATH || path.join(app.getPath('userData'), 'distill.db'),
    private readonly migrationsPath = resolveMigrationsPath()
  ) {}

  open(): SqliteDatabase {
    if (this.db) {
      return this.db;
    }

    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.db = new Database(this.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private runMigrations(): void {
    const db = this.openWithoutMigrating();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      db.prepare('SELECT id FROM schema_migration').all().map((row) => (row as { id: string }).id)
    );

    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');
      const apply = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      });
      apply();
      logger.info('Database', `Applied migration ${file}`);
    }
  }

  private openWithoutMigrating(): SqliteDatabase {
    if (!this.db) {
      throw new Error('Database was not opened before migration.');
    }
    return this.db;
  }
}

function resolveMigrationsPath(): string {
  const candidates = [
    path.join(process.cwd(), 'src', 'main', 'database', 'migrations'),
    path.join(process.resourcesPath ?? '', 'migrations'),
    path.join(__dirname, '..', 'database', 'migrations')
  ];

  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Could not locate database migrations. Checked: ${candidates.join(', ')}`);
  }
  return found;
}
