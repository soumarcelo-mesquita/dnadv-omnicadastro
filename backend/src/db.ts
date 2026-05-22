import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_ANON_KEY variables are not set. Supabase Auth validation will fail.");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL variable is not set. Please set it in backend/.env");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('supabase') || process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

/**
 * Initializes the database schema, creating tables and indexes if they do not exist.
 */
export async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log("Initializing database schema...");
    
    // Create Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pessoas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        cpf VARCHAR(50) NOT NULL,
        nome_normalizado VARCHAR(255) NOT NULL
      );
    `);

    // Migrate existing table column to support longer formatting if table already exists
    await client.query(`
      ALTER TABLE pessoas ALTER COLUMN cpf TYPE VARCHAR(50);
    `);

    // Create Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas (cpf);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pessoas_nome_normalizado ON pessoas (nome_normalizado);
    `);

    // Create FTS GIN index for fast partial token searches
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pessoas_nome_fts ON pessoas USING GIN (to_tsvector('simple', nome_normalizado));
    `);

    console.log("Database schema initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  } finally {
    client.release();
  }
}
