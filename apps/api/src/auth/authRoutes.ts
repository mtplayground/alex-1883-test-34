import { Router, type RequestHandler, type Response } from "express";
import { appConfig } from "../config/env.js";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleOAuthCode,
  fetchGoogleUserProfile,
  GoogleOAuthConfigError,
  timingSafeStateEqual
} from "./googleOAuth.js";
import { readCookieValue } from "./cookies.js";
import { HttpError } from "../http/errors.js";
import { provisionGoogleUser } from "../users/provisionGoogleUser.js";
import { issueJwtForUser } from "./jwt.js";

const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const authRouter = Router();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function renderGoogleOAuthConfigPage(
  res: Response,
  error: GoogleOAuthConfigError
): void {
  const missingSettings = error.settings.map(escapeHtml);
  const settingList = missingSettings.map((setting) => `<li>${setting}</li>`).join("");

  res.status(error.statusCode).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Google sign-in is not configured</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; }
      main { max-width: 42rem; padding: 2rem; }
      h1 { font-size: 1.75rem; margin: 0 0 1rem; }
      p { line-height: 1.6; color: #cbd5e1; }
      ul { border: 1px solid #334155; border-radius: 0.5rem; padding: 1rem 1rem 1rem 2rem; background: #111827; }
      code, li { color: #f8fafc; }
    </style>
  </head>
  <body>
    <main>
      <h1>Google sign-in is not configured</h1>
      <p>The server is missing the following Google OAuth setting${missingSettings.length === 1 ? "" : "s"}:</p>
      <ul>${settingList}</ul>
      <p>Set the missing value${missingSettings.length === 1 ? "" : "s"} and use callback path <code>/api/auth/google/callback</code>.</p>
    </main>
  </body>
</html>`);
}

function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: OAUTH_STATE_MAX_AGE_MS,
    path: "/api/auth/google/callback",
    sameSite: "lax" as const,
    secure: appConfig.nodeEnv === "production"
  };
}

function requiredQueryString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `Missing OAuth ${name}`);
  }

  return value;
}

const startGoogleOAuth: RequestHandler = (_req, res, next) => {
  try {
    const state = createOAuthState();
    const authorizationUrl = buildGoogleAuthorizationUrl(state);

    res.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions());
    res.redirect(authorizationUrl);
  } catch (error) {
    if (error instanceof GoogleOAuthConfigError) {
      renderGoogleOAuthConfigPage(res, error);
      return;
    }

    next(error);
  }
};

const completeGoogleOAuth: RequestHandler = async (req, res, next) => {
  try {
    const code = requiredQueryString(req.query.code, "code");
    const state = requiredQueryString(req.query.state, "state");
    const cookieState = readCookieValue(req.headers.cookie, GOOGLE_OAUTH_STATE_COOKIE);

    res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
      path: "/api/auth/google/callback"
    });

    if (!cookieState || !timingSafeStateEqual(state, cookieState)) {
      throw new HttpError(400, "OAuth state did not match");
    }

    const accessToken = await exchangeGoogleOAuthCode(code);
    const profile = await fetchGoogleUserProfile(accessToken);
    const user = await provisionGoogleUser(profile);
    const token = issueJwtForUser(user);

    res.json({
      token,
      tokenType: "Bearer",
      user
    });
  } catch (error) {
    if (error instanceof GoogleOAuthConfigError) {
      renderGoogleOAuthConfigPage(res, error);
      return;
    }

    next(error);
  }
};

authRouter.get("/google", startGoogleOAuth);
authRouter.get("/google/callback", completeGoogleOAuth);
