import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@libsql/client';

// R2 configuration
const r2_access_key = process.env.R2_ACCESS_KEY_ID || '';
const r2_secret_key = process.env.R2_SECRET_ACCESS_KEY || '';
const r2_endpoint = process.env.R2_ENDPOINT || '';
const bucket_name = process.env.R2_BUCKET_NAME || 'tendertrace';

// Turso / libsql configuration
const turso_url = process.env.TURSO_DATABASE_URL || '';
const turso_auth_token = process.env.TURSO_AUTH_TOKEN || '';

// Singleton Turso client
let tursoClient: ReturnType<typeof createClient> | null = null;

function getTursoClient() {
  if (!tursoClient) {
    if (!turso_url) {
      throw new Error('TURSO_DATABASE_URL is not set. Add it to your environment variables.');
    }
    tursoClient = createClient({
      url: turso_url,
      authToken: turso_auth_token || undefined,
    });
  }
  return tursoClient;
}

function getR2Client() {
  return new S3Client({
    endpoint: r2_endpoint,
    credentials: {
      accessKeyId: r2_access_key,
      secretAccessKey: r2_secret_key,
    },
    region: 'auto',
  });
}

/**
 * Execute a SQL query against Turso (libsql).
 * Translates Postgres-style placeholders ($1, $2) to SQLite-style (?).
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  // Convert standard SQL query format to SQLite/libsql placeholders
  let sqliteText = text.replace(/\$\d+/g, '?');
  sqliteText = sqliteText.replace(/ILIKE/gi, 'LIKE');
  sqliteText = sqliteText.replace(/::[a-zA-Z]+/g, '');

  try {
    const client = getTursoClient();
    const result = await client.execute({ sql: sqliteText, args: params });
    return result.rows as T[];
  } catch (error) {
    console.error('Turso Query Error:', error);
    throw error;
  }
}

/**
 * Execute a SQL query and return the first row.
 */
export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a SQL query and return the first column of the first row.
 */
export async function queryValue<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const row = await queryOne<T>(text, params);
  if (!row) return null;
  const values = Object.values(row as any);
  return values.length > 0 ? (values[0] as T) : null;
}

/**
 * Fetch precomputed JSON file from Cloudflare R2
 */
export async function fetchR2Json(key: string): Promise<any> {
  try {
    const r2Client = getR2Client();
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: bucket_name,
      Key: key,
    }));

    const stream = response.Body;
    if (!stream) {
      throw new Error('R2 response body is empty');
    }

    const data = await new Promise<string>((resolve, reject) => {
      let result = '';
      const readableStream = stream as any;
      readableStream.on('data', (chunk: any) => { result += chunk.toString(); });
      readableStream.on('end', () => resolve(result));
      readableStream.on('error', reject);
    });

    return JSON.parse(data);
  } catch (error) {
    console.error(`[R2] Error fetching key ${key}:`, error);
    throw error;
  }
}