import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
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

/**
 * Delete EVERY version of an object (plus its delete markers). The bucket
 * keeps all versions, so a plain single-version delete would only add a
 * delete marker and keep billing the old bytes. Falls back to a plain
 * delete when the key lacks list/delete-versions permission.
 */
export async function deleteB2Object(objectKey: string): Promise<void> {
  const config = requireConfig();
  const client = getClient(config);
  const key = objectKey;
  try {
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListObjectVersionsCommand({
          Bucket: config.bucket,
          Prefix: key,
          MaxKeys: 100,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
      );
      const targets = [
        ...(page.Versions ?? [])
          .filter((v) => v.Key === key && v.VersionId)
          .map((v) => ({ Key: key, VersionId: v.VersionId! })),
        ...(page.DeleteMarkers ?? [])
          .filter((d) => d.Key === key && d.VersionId)
          .map((d) => ({ Key: key, VersionId: d.VersionId! })),
      ];
      if (targets.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: targets, Quiet: true },
          }),
        );
      }
      if (!page.IsTruncated) break;
      keyMarker = page.NextKeyMarker;
      versionMarker = page.NextVersionIdMarker;
      if (!keyMarker) break;
    }
    return;
  } catch (err) {
    if (!isNotFound(err)) {
      // Fall back to a plain delete (best effort) for restricted keys.
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return;
      } catch (inner) {
        if (!isNotFound(inner)) throw inner;
        return;
      }
    }
    throw err;
  }
}

/**
 * Live bucket usage — sums EVERY stored version via the B2 native API
 * (b2_list_file_versions). This is the ground truth for the storage bar:
 * an S3 ListObjectsV2 only sees current versions, so it reports 0 while
 * the B2 console still bills old/hidden versions (e.g. a test file that
 * was "deleted" but kept as history). Summing all versions (except
 * zero-byte hide markers) makes the bar match the billed size.
 */
export async function getB2BucketUsage(): Promise<{
  used: number;
  objects: number;
}> {
  const config = requireConfig();
  type B2Auth = {
    accountId: string;
    apiUrl: string;
    authorizationToken: string;
  };
  const authRes = await fetch(
    "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
    {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.accessKeyId}:${config.secretAccessKey}`,
        ).toString("base64")}`,
      },
    },
  );
  if (!authRes.ok) {
    throw new Error(`B2 auth failed (${authRes.status})`);
  }
  const auth = (await authRes.json()) as B2Auth;
  const authHeader = { Authorization: auth.authorizationToken };

  const bucketRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: auth.accountId, bucketName: config.bucket }),
  });
  if (!bucketRes.ok) {
    throw new Error(`B2 bucket lookup failed (${bucketRes.status})`);
  }
  const bucketBody = (await bucketRes.json()) as {
    buckets?: { bucketId: string }[];
  };
  const bucketId = bucketBody.buckets?.[0]?.bucketId;
  if (!bucketId) {
    throw new Error(`B2 bucket "${config.bucket}" not found`);
  }

  let used = 0;
  let objects = 0;
  let nextFileId: string | null | undefined;
  let nextFileName: string | null | undefined;
  for (;;) {
    // startFileId/startFileName must be sent together — B2 rejects a lone
    // startFileId with 400, which would break pagination past 1000 files.
    const hasCursor = Boolean(nextFileId && nextFileName);
    const pageRes = await fetch(
      `${auth.apiUrl}/b2api/v2/b2_list_file_versions`,
      {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketId,
          maxFileCount: 1000,
          ...(hasCursor
            ? { startFileId: nextFileId, startFileName: nextFileName }
            : {}),
        }),
      },
    );
    if (!pageRes.ok) {
      throw new Error(`B2 file listing failed (${pageRes.status})`);
    }
    const page = (await pageRes.json()) as {
      files?: { action?: string; contentLength?: number }[];
      nextFileId?: string | null;
      nextFileName?: string | null;
    };
    for (const file of page.files ?? []) {
      objects += 1;
      // Hide markers are zero bytes; real versions (upload/start) are billed.
      used += file.contentLength ?? 0;
    }
    nextFileId = page.nextFileId;
    nextFileName = page.nextFileName;
    if (!nextFileId && !nextFileName) break;
  }
  return { used, objects };
}

function isNotFound(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 404) return true;
    if (e.name === "NotFound" || e.name === "NoSuchKey") return true;
  }
  return false;
}