import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    port: process.env.PG_PORT,
});

// Migración liviana: tipo de turno (APPOINTMENT | BREAK | LUNCH)
export async function ensureSchema() {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'APPOINTMENT'`);
    // Break/almuerzo no tienen servicio
    await pool.query(`ALTER TABLE appointments ALTER COLUMN service_id DROP NOT NULL`);
}
