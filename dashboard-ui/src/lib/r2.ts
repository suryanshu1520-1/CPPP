import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Endpoint + bucket are non-secret account/bucket identifiers (like the Supabase
// project URL) — safe to default in code so a missing R2_ENDPOINT env var can't
// silently send requests to the wrong host. Overridable via env.
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  'https://3d705866c73b85338f235ec768a71a07.r2.cloudflarestorage.com';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'tendertrace';

// The access key ID + secret are the actual credentials and stay in env.
// Tolerate the common name variants people save from Cloudflare's "S3 API"
// credentials panel (it labels them "Access Key ID" / "Secret Access Key").
function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}
const R2_ACCESS_KEY = firstEnv(
  'R2_ACCESS_KEY_ID',
  'R2_Access_Key_ID_S3',
  'R2_ACCESS_KEY_ID_S3',
);
const R2_SECRET_KEY = firstEnv(
  'R2_SECRET_ACCESS_KEY',
  'R2_Secret_Access_Key',
);

function getR2Client() {
  return new S3Client({
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
    region: 'auto',
  });
}

/**
 * Fetch precomputed JSON file from Cloudflare R2
 */
export async function fetchR2Json(key: string): Promise<any> {
  try {
    const r2Client = getR2Client();
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
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
