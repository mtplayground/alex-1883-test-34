import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandOutput
} from "@aws-sdk/client-s3";
import { appConfig } from "../config/env.js";

type UploadBody = Buffer | Uint8Array | string;

type ObjectStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  publicBaseUrl?: string;
  region: string;
  secretAccessKey: string;
};

export type UploadObjectInput = {
  body: UploadBody;
  contentType?: string;
  key: string;
  metadata?: Record<string, string>;
};

export type UploadObjectResult = {
  eTag?: string;
  key: string;
  url: string;
};

let objectStorageClient: S3Client | undefined;

export function isObjectStorageConfigured(): boolean {
  const config = appConfig.objectStorage;

  return Boolean(
    config.accessKeyId && config.bucket && config.endpoint && config.secretAccessKey
  );
}

function requireObjectStorageConfig(): ObjectStorageConfig {
  const config = appConfig.objectStorage;
  const {
    accessKeyId,
    bucket,
    endpoint,
    prefix,
    publicBaseUrl,
    region,
    secretAccessKey
  } = config;
  const missing = [
    ["OBJECT_STORAGE_ACCESS_KEY_ID", accessKeyId],
    ["OBJECT_STORAGE_BUCKET", bucket],
    ["OBJECT_STORAGE_ENDPOINT", endpoint],
    ["OBJECT_STORAGE_SECRET_ACCESS_KEY", secretAccessKey]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Object Storage configuration is missing: ${missing.join(", ")}`);
  }

  if (!accessKeyId || !bucket || !endpoint || !secretAccessKey) {
    throw new Error("Object Storage configuration is incomplete");
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    prefix,
    publicBaseUrl,
    region: region ?? "auto",
    secretAccessKey
  };
}

function normalizeStoragePath(value: string): string {
  return value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function encodeStoragePath(value: string): string {
  return normalizeStoragePath(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function contentLengthForBody(body: UploadBody): number {
  if (typeof body === "string") {
    return Buffer.byteLength(body);
  }

  return body.byteLength;
}

export function toObjectStorageKey(rawKey: string): string {
  const { prefix } = requireObjectStorageConfig();
  const normalizedPrefix = normalizeStoragePath(prefix);
  const normalizedKey = normalizeStoragePath(rawKey);

  if (!normalizedPrefix) {
    throw new Error("Object Storage prefix cannot be empty");
  }

  if (!normalizedKey) {
    throw new Error("Object Storage key cannot be empty");
  }

  if (
    normalizedKey === normalizedPrefix ||
    normalizedKey.startsWith(`${normalizedPrefix}/`)
  ) {
    return normalizedKey;
  }

  return `${normalizedPrefix}/${normalizedKey}`;
}

export function getObjectStorageClient(): S3Client {
  const config = requireObjectStorageConfig();

  objectStorageClient ??= new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: config.region,
    requestChecksumCalculation: "WHEN_REQUIRED"
  });

  return objectStorageClient;
}

export function getObjectUrl(rawKey: string): string {
  const config = requireObjectStorageConfig();
  const key = toObjectStorageKey(rawKey);
  const encodedKey = encodeStoragePath(key);

  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  const encodedBucket = encodeURIComponent(config.bucket);

  return `${endpoint}/${encodedBucket}/${encodedKey}`;
}

export async function uploadObject(
  input: UploadObjectInput
): Promise<UploadObjectResult> {
  const config = requireObjectStorageConfig();
  const key = toObjectStorageKey(input.key);
  const contentLength = contentLengthForBody(input.body);
  const result: PutObjectCommandOutput = await getObjectStorageClient().send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: config.bucket,
      ContentLength: contentLength,
      ContentType: input.contentType,
      Key: key,
      Metadata: input.metadata
    })
  );

  return {
    eTag: result.ETag,
    key,
    url: getObjectUrl(key)
  };
}
