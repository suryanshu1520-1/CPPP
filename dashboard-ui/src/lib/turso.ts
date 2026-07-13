import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dbInstance: any = null;
let downloadPromise: Promise<string> | null = null;

const r2_access_key = process.env.R2_ACCESS_KEY_ID || '';
const r2_secret_key = process.env.R2_SECRET_ACCESS_KEY || '';
const r2_endpoint = process.env.R2_ENDPOINT || '';
const bucket_name = process.env.R2_BUCKET_NAME || 'tendertrace';
const db_key = 'dashboard_lite.db';

// Resolve local development path vs serverless /tmp path
const localDevPath = path.resolve(process.cwd(), '..', 'dashboard_lite.db');
const localAltPath = path.resolve(process.cwd(), 'dashboard_lite.db');
const tmpDbPath = path.join(os.tmpdir(), 'dashboard_lite.db');

// Create R2 client instance
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

async function ensureDbFile(): Promise<string> {
  // 1. Check if local dev db exists
  if (fs.existsSync(localDevPath)) {
    console.log('[DB] Using local dev database:', localDevPath);
    return localDevPath;
  }
  if (fs.existsSync(localAltPath)) {
    console.log('[DB] Using local dev database:', localAltPath);
    return localAltPath;
  }

  // 2. Check if temp db already exists
  if (fs.existsSync(tmpDbPath)) {
    return tmpDbPath;
  }

  // 3. Download it from Cloudflare R2 on demand
  if (!downloadPromise) {
    downloadPromise = (async () => {
      console.log(`[DB] Downloading ${db_key} from R2 bucket ${bucket_name} to ${tmpDbPath}...`);
      
      const r2Client = getR2Client();
      const response = await r2Client.send(new GetObjectCommand({
        Bucket: bucket_name,
        Key: db_key,
      }));
      
      const stream = response.Body;
      if (!stream) {
        throw new Error('R2 response body is empty');
      }

      // Write stream to file
      const fileStream = fs.createWriteStream(tmpDbPath);
      const readableStream = stream as any;

      await new Promise<void>((resolve, reject) => {
        readableStream.pipe(fileStream);
        readableStream.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
      
      console.log('[DB] Database downloaded successfully from R2.');
      return tmpDbPath;
    })();
  }

  return downloadPromise;
}

async function getDbConnection() {
  if (dbInstance) return dbInstance;
  
  const dbFilePath = await ensureDbFile();
  
  dbInstance = new Database(dbFilePath, { readonly: true });
  // Optimizations for concurrent, fast read queries
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('temp_store = MEMORY');
  dbInstance.pragma('cache_size = -65536'); // 64MB cache
  return dbInstance;
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  // Convert standard SQL query format back to SQLite placeholders
  let sqliteText = text.replace(/\$\d+/g, '?');
  sqliteText = sqliteText.replace(/ILIKE/gi, 'LIKE');
  sqliteText = sqliteText.replace(/::[a-zA-Z]+/g, '');

  try {
    const db = await getDbConnection();
    const stmt = db.prepare(sqliteText);
    const rows = stmt.all(params);
    return rows as T[];
  } catch (error) {
    console.error('SQLite Query Error:', error);
    throw error;
  }
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function queryValue<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const row = await queryOne(text, params);
  if (!row) return null;
  const values = Object.values(row);
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
