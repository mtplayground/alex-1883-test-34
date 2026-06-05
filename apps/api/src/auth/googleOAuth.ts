import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { appConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional()
});

const googleUserInfoSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
  sub: z.string().min(1)
});

type GoogleOAuthConfig = {
  baseUrl?: string;
  callbackUrl: string;
  clientId: string;
  clientSecret: string;
};

export type GoogleUserProfile = z.infer<typeof googleUserInfoSchema>;

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

export class GoogleOAuthConfigError extends HttpError {
  constructor(public readonly settings: string[]) {
    super(
      503,
      `Google sign-in is not configured. Missing setting: ${settings.join(", ")}`,
      "GOOGLE_OAUTH_CONFIG_MISSING"
    );
    this.name = "GoogleOAuthConfigError";
  }
}

function callbackUrlFromBaseUrl(baseUrl: string): string {
  return new URL(GOOGLE_OAUTH_CALLBACK_PATH, baseUrl).toString();
}

function callbackUrlPath(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

export function googleOAuthConfigIssues(): string[] {
  const config = appConfig.googleOAuth;
  const issues: string[] = [];

  if (!config.clientId) {
    issues.push("GOOGLE_CLIENT_ID");
  }

  if (!config.clientSecret) {
    issues.push("GOOGLE_CLIENT_SECRET");
  }

  if (!config.callbackUrl && !config.baseUrl) {
    issues.push("GOOGLE_CALLBACK_URL or GOOGLE_BASE_URL");
  }

  if (config.callbackUrl && callbackUrlPath(config.callbackUrl) === null) {
    issues.push("GOOGLE_CALLBACK_URL must be a valid URL");
  }

  if (config.baseUrl && callbackUrlPath(config.baseUrl) === null) {
    issues.push("GOOGLE_BASE_URL must be a valid URL");
  }

  const callbackUrl =
    config.callbackUrl ??
    (config.baseUrl && callbackUrlPath(config.baseUrl) !== null
      ? callbackUrlFromBaseUrl(config.baseUrl)
      : undefined);

  if (
    callbackUrl &&
    callbackUrlPath(callbackUrl) !== GOOGLE_OAUTH_CALLBACK_PATH
  ) {
    issues.push(
      `GOOGLE_CALLBACK_URL must use callback path ${GOOGLE_OAUTH_CALLBACK_PATH}`
    );
  }

  return issues;
}

export function logGoogleOAuthConfigSelfCheck(): void {
  const issues = googleOAuthConfigIssues();

  if (issues.length > 0) {
    console.warn("Google OAuth configuration incomplete", {
      missingSettings: issues
    });
  }
}

function requireGoogleOAuthConfig(): GoogleOAuthConfig {
  const config = appConfig.googleOAuth;
  const issues = googleOAuthConfigIssues();

  if (issues.length > 0) {
    throw new GoogleOAuthConfigError(issues);
  }

  const callbackUrl =
    config.callbackUrl ??
    (config.baseUrl ? callbackUrlFromBaseUrl(config.baseUrl) : undefined);

  if (!callbackUrl || !config.clientId || !config.clientSecret) {
    throw new GoogleOAuthConfigError(googleOAuthConfigIssues());
  }

  return {
    baseUrl: config.baseUrl,
    callbackUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret
  };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function timingSafeStateEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const config = requireGoogleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("access_type", "online");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeGoogleOAuthCode(code: string): Promise<string> {
  const config = requireGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.callbackUrl
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new HttpError(502, "Google OAuth token exchange failed");
  }

  const parsed = googleTokenResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new HttpError(502, "Google OAuth token response was invalid");
  }

  return parsed.data.access_token;
}

export async function fetchGoogleUserProfile(
  accessToken: string
): Promise<GoogleUserProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new HttpError(502, "Google user profile request failed");
  }

  const parsed = googleUserInfoSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new HttpError(502, "Google user profile response was invalid");
  }

  if (parsed.data.email_verified === false) {
    throw new HttpError(403, "Google account email is not verified");
  }

  return parsed.data;
}
