import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbClient = null;
let isPGlite = false;

class DBWrapper {
  constructor() {
    this.pool = null;
    this.pglite = null;
    this.isReady = false;
  }

  async init() {
    if (this.isReady) return;

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && !databaseUrl.includes('placeholder')) {
      try {
        console.log('Connecting to PostgreSQL database at:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
        const pool = new pg.Pool({
          connectionString: databaseUrl,
          connectionTimeoutMillis: 3000,
        });

        // Test connection
        const res = await pool.query('SELECT NOW()');
        console.log('✅ Connected to external PostgreSQL database! Server time:', res.rows[0].now);
        this.pool = pool;
        this.isReady = true;
        await this.runMigrations();
        return;
      } catch (err) {
        console.warn('⚠️ External PostgreSQL connection failed:', err.message);
        console.log('Falling back to embedded high-performance PostgreSQL (PGlite)...');
      }
    }

    // Fallback to PGlite (Real WASM PostgreSQL engine with zero external dependencies)
    try {
      const dataDir = path.resolve(__dirname, '../../data/pglite_db');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      console.log('⚡ Initializing embedded PostgreSQL (PGlite) in:', dataDir);
      this.pglite = new PGlite(dataDir);
      await this.pglite.waitReady;
      isPGlite = true;
      console.log('✅ Embedded PostgreSQL (PGlite) ready!');
      this.isReady = true;
      await this.runMigrations();
    } catch (err) {
      console.error('❌ Failed to initialize database engine:', err);
      throw err;
    }
  }

  async query(text, params = []) {
    if (!this.isReady) {
      await this.init();
    }

    if (this.pool) {
      return await this.pool.query(text, params);
    } else if (this.pglite) {
      // PGlite returns { rows, fields }
      const res = await this.pglite.query(text, params);
      return {
        rows: res.rows || [],
        rowCount: (res.rows && res.rows.length) || 0,
        fields: res.fields || [],
      };
    }
    throw new Error('Database not initialized');
  }

  async runMigrations() {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      // Split queries if needed or run as batch
      if (this.pool) {
        await this.pool.query(schemaSql);
      } else if (this.pglite) {
        await this.pglite.exec(schemaSql);
      }
      console.log('✅ PostgreSQL database schema ensured.');
    } catch (err) {
      console.error('Error running schema migrations:', err.message);
    }
  }
}

const db = new DBWrapper();
export default db;
