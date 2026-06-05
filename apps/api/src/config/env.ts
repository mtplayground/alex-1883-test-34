import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(moduleDir, "../../../..");
const apiRoot = resolve(workspaceRoot, "apps/api");

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const portSchema = z.preprocess((value) => {
  if (value === undefined || value === "") {
    return 8080;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      return Number.NaN;
    }

    return Number.parseInt(normalized, 10);
  }

  return value;
}, z.number().int().min(1).max(65535));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GOOGLE_OAUTH_CALLBACK_URL: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  HOST: z.string().min(1).default("0.0.0.0"),
  JWT_SECRET: optionalString,
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OBJECT_STORAGE_ACCESS_KEY_ID: optionalString,
  OBJECT_STORAGE_BUCKET: optionalString,
  OBJECT_STORAGE_ENDPOINT: optionalString,
  OBJECT_STORAGE_PREFIX: z.string().min(1).default("uploads"),
  OBJECT_STORAGE_REGION: optionalString,
  OBJECT_STORAGE_SECRET_ACCESS_KEY: optionalString,
  PORT: portSchema
});

function loadEnvironmentFiles(): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const fileNames = [
    process.env.DOTENV_CONFIG_PATH,
    `.env.${nodeEnv}`,
    ".env.local",
    ".env"
  ].filter((fileName): fileName is string => Boolean(fileName));

  const roots = [workspaceRoot, apiRoot];

  for (const fileName of fileNames) {
    for (const root of roots) {
      const envPath = resolve(root, fileName);

      if (existsSync(envPath)) {
        loadDotenv({
          override: false,
          path: envPath
        });
      }
    }
  }
}

function readConfig() {
  loadEnvironmentFiles();

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;

  return Object.freeze({
    databaseUrl: env.DATABASE_URL,
    googleOAuth: {
      callbackUrl: env.GOOGLE_OAUTH_CALLBACK_URL,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET
    },
    jwt: {
      secret: env.JWT_SECRET
    },
    nodeEnv: env.NODE_ENV,
    objectStorage: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
      bucket: env.OBJECT_STORAGE_BUCKET,
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      prefix: env.OBJECT_STORAGE_PREFIX,
      region: env.OBJECT_STORAGE_REGION,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY
    },
    server: {
      host: env.HOST,
      port: env.PORT
    }
  });
}

export const appConfig = readConfig();
export type AppConfig = typeof appConfig;
