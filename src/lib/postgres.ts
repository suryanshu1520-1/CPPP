/**
 * PostgreSQL connection pool using node-postgres (pg).
 * Replaces better-sqlite3 for production PostgreSQL + TimescaleDB backend.
 */

import { Pool, PoolClient } from 'pg';

// Connection configuration from environment variables
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tender_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',

    // Connection pool settings
    min: 5,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    maxUses: 7500,

    // SSL configuration (for production)
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false
    } : false
});

// Error handling
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

/**
 * Execute a query and return all rows
 */
export async function query<T = any>(
    text: string,
    params?: any[]
): Promise<T[]> {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 100ms)
    if (duration > 100) {
        console.log('Slow query', { text, duration, rows: result.rowCount });
    }

    return result.rows;
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = any>(
    text: string,
    params?: any[]
): Promise<T | null> {
    const result = await query<T>(text, params);
    return result[0] || null;
}

/**
 * Execute a query and return a single value
 */
export async function queryValue<T = any>(
    text: string,
    params?: any[]
): Promise<T | null> {
    const result = await query(text, params);
    if (result.length === 0) return null;
    const firstRow = result[0] as any;
    const firstKey = Object.keys(firstRow)[0];
    return firstRow[firstKey] as T;
}

/**
 * Execute a query without returning results
 */
export async function execute(
    text: string,
    params?: any[]
): Promise<void> {
    await pool.query(text, params);
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
    return await pool.connect();
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
    await pool.end();
}

/**
 * Health check - verify database connection
 */
export async function healthCheck(): Promise<boolean> {
    try {
        const result = await queryValue<number>('SELECT 1');
        return result === 1;
    } catch (error) {
        console.error('Database health check failed:', error);
        return false;
    }
}

export default pool;