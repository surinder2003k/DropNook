import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Optional Backblaze B2 storage backend (S3-compatible).
 *
 * B2's free tier includes 10 GB of storage (vs Supabase Free's 1 GB) and
 * signup does not require a credit card. When every DROPNOOK_B2_* env var is
 * set, new uploads go to B2 instead of the Supabase `uploads` bucket.
 *
 * Files are told apart by their storage_key: B2 objects are stored as
 * `b2:<object-key>`, so rows created before B2 was configured (Supabase
 * objects) keep downloading and deleting through the Supabase path.
 */
export const B2_KEY_PREFIX = "b2:";

const PUT_URL_TTL_SECONDS = 15 * 60;
const GET_URL_TTL_SECONDS = 60 * 60;

type B2Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function readConfig(): B2Config | null {
  const endpoint = process.env.DROPNOOK_B2_ENDPOINT?.trim();
  const region = process.env.DROPNOOK_B2_REGION?.trim();
  const bucket = process.env.DROPNOOK_B2_BUCKET?.trim();
  const accessKeyId = process.env.DROPNOOK_B2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DROPNOOK_B2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

/** True when the whole DROPNOOK_B2_* credential set is present. */
export function isB2Configured(): boolean {
  return readConfig() !== null;
}

let cached: { config: B2Config; client: S3Client } | null = null;

function getClient(config: B2Config): S3Client {
  if (!cached || cached.config !== config) {
    cached = {
      config,
      client: new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        // B2 supports path-style URLs (https://s3.<region>.backblazeb2.com/<bucket>/…),
        // which keeps presigning simple with a single custom endpoint.
        forcePathStyle: true,
        // Presigned PUTs must not carry the SDK's default CRC32 checksum
        // placeholders — they would be baked into the signed query string and
        // reject every real upload body at the server.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    };
  }
  return cached.client;
}

function requireConfig(): B2Config {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "B2 storage is not configured — set DROPNOOK_B2_ENDPOINT, DROPNOOK_B2_REGION, DROPNOOK_B2_BUCKET, DROPNOOK_B2_ACCESS_KEY_ID and DROPNOOK_B2_SECRET_ACCESS_KEY",
    );
  }
  return config;
}

/** `b2:key` → object key. Returns null when storage_key belongs to Supabase. */
export function b2ObjectKey(storageKey: string): string | null {
  return storageKey.startsWith(B2_KEY_PREFIX)
    ? storageKey.slice(B2_KEY_PREFIX.length)
    : null;
}

/**
 * Short-lived presigned PUT URL — the browser streams the file bytes straight
 * to B2 (same direct-to-storage pattern used for Supabase, so the 4.5 MB
 * serverless body cap never applies).
 */
export async function presignB2Upload(objectKey: string): Promise<string> {
  const config = requireConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
  });
  return getSignedUrl(getClient(config), command, {
    expiresIn: PUT_URL_TTL_SECONDS,
  });
}

/** Presigned GET URL that forces an attachment download with the real filename. */
export async function presignB2Download(
  objectKey: string,
  filename: string,
): Promise<string> {
  const config = requireConfig();
  const asciiName =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ResponseContentDisposition: disposition,
  });
  return getSignedUrl(getClient(config), command, {
    expiresIn: GET_URL_TTL_SECONDS,
  });
}

/**
 * Object size in bytes, or null when the object does not exist. Used to verify
 * an upload actually landed (and to enforce the size cap that a presigned PUT
 * cannot enforce by itself).
 */
export async function headB2Object(objectKey: string): Promise<number | null> {
  const config = requireConfig();
  try {
    const result = await getClient(config).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
    return result.ContentLength ?? 0;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Best-effort delete — an already-missing object is not an error. */
export async function deleteB2Object(objectKey: string): Promise<void> {
  const config = requireConfig();
  try {
    await getClient(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 404) return true;
    if (e.name === "NotFound" || e.name === "NoSuchKey") return true;
  }
  return false;
}