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
  callbackUrl: string;
  clientId: string;
  clientSecret: string;
};

export type GoogleUserProfile = z.infer<typeof googleUserInfoSchema>;

function requireGoogleOAuthConfig(): GoogleOAuthConfig {
  const config = appConfig.googleOAuth;
  const missing = [
    ["GOOGLE_OAUTH_CALLBACK_URL", config.callbackUrl],
    ["GOOGLE_OAUTH_CLIENT_ID", config.clientId],
    ["GOOGLE_OAUTH_CLIENT_SECRET", config.clientSecret]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new HttpError(
      500,
      `Google OAuth configuration is missing: ${missing.join(", ")}`,
      "GOOGLE_OAUTH_CONFIG_MISSING"
    );
  }

  if (!config.callbackUrl || !config.clientId || !config.clientSecret) {
    throw new HttpError(500, "Google OAuth configuration is incomplete");
  }

  return {
    callbackUrl: config.callbackUrl,
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
