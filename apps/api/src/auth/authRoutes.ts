import { Router, type RequestHandler } from "express";
import { appConfig } from "../config/env.js";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleOAuthCode,
  fetchGoogleUserProfile,
  timingSafeStateEqual
} from "./googleOAuth.js";
import { readCookieValue } from "./cookies.js";
import { HttpError } from "../http/errors.js";
import { provisionGoogleUser } from "../users/provisionGoogleUser.js";
import { issueJwtForUser } from "./jwt.js";

const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const authRouter = Router();

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
    next(error);
  }
};

authRouter.get("/google", startGoogleOAuth);
authRouter.get("/google/callback", completeGoogleOAuth);
