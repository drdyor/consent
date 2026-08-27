// De-Manus storage seam (WINDOW_C4 Stage 3): STORAGE_PROVIDER=s3.
//
// Presigned PUT/GET against any S3-compatible endpoint (MinIO, Cloudflare R2,
// AWS S3) using the @aws-sdk packages that were ALREADY in package.json
// ("the S3 target is half-wired" — QA audit). Path-style addressing is forced
// whenever a custom endpoint is configured, which is what MinIO requires.
//
// Env (all required when STORAGE_PROVIDER=s3, except region):
//   S3_ENDPOINT   e.g. http://127.0.0.1:9000  (omit/empty for real AWS S3)
//   S3_BUCKET
//   S3_ACCESS_KEY
//   S3_SECRET_KEY
//   S3_REGION     default us-east-1

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "../_core/env";

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

export function getS3Config(): S3Config {
  const config: S3Config = {
    endpoint: ENV.s3Endpoint,
    bucket: ENV.s3Bucket,
    accessKey: ENV.s3AccessKey,
    secretKey: ENV.s3SecretKey,
    region: ENV.s3Region || "us-east-1",
  };
  const missing = (["bucket", "accessKey", "secretKey"] as const).filter(
    key => !config[key]
  );
  if (missing.length) {
    throw new Error(
      `Storage config missing for STORAGE_PROVIDER=s3: set ${missing
        .map(k => ({ bucket: "S3_BUCKET", accessKey: "S3_ACCESS_KEY", secretKey: "S3_SECRET_KEY" })[k])
        .join(", ")}`
    );
  }
  return config;
}

let cachedClient: { key: string; client: S3Client } | null = null;

export function buildS3Client(config: S3Config): S3Client {
  const cacheKey = JSON.stringify(config);
  if (cachedClient?.key === cacheKey) return cachedClient.client;
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
  cachedClient = { key: cacheKey, client };
  return client;
}

const PRESIGN_PUT_TTL_SECONDS = 300;
const PRESIGN_GET_TTL_SECONDS = 300;

/** Presigned PUT URL for uploading `key` with the given content type. */
export async function s3PresignPut(
  key: string,
  contentType: string,
  config: S3Config = getS3Config()
): Promise<string> {
  const client = buildS3Client(config);
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_PUT_TTL_SECONDS }
  );
}

/** Presigned GET URL for downloading `key`. */
export async function s3PresignGet(
  key: string,
  config: S3Config = getS3Config()
): Promise<string> {
  const client = buildS3Client(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: PRESIGN_GET_TTL_SECONDS }
  );
}
