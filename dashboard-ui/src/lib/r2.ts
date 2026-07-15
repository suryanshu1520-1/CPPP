import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// R2 configuration
const r2_access_key = process.env.R2_ACCESS_KEY_ID || '';
const r2_secret_key = process.env.R2_SECRET_ACCESS_KEY || '';
const r2_endpoint = process.env.R2_ENDPOINT || '';
const bucket_name = process.env.R2_BUCKET_NAME || 'tendertrace';

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
