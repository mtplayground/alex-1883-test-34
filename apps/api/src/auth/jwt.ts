import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { appConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";

type JwtUserInput = {
  id: string;
  username: string;
};

export type VerifiedJwt = {
  expiresAt?: number;
  issuedAt?: number;
  userId: string;
  username?: string;
};

function requireJwtSecret(): string {
  const { secret } = appConfig.jwt;

  if (!secret) {
    throw new HttpError(500, "JWT_SECRET is required", "JWT_CONFIG_MISSING");
  }

  return secret;
}

export function issueJwtForUser(user: JwtUserInput): string {
  const signOptions: SignOptions = {
    algorithm: "HS256",
    expiresIn: appConfig.jwt.expiresIn as SignOptions["expiresIn"],
    subject: user.id
  };

  return jwt.sign(
    {
      username: user.username
    },
    requireJwtSecret(),
    signOptions
  );
}

function isJwtPayload(value: string | JwtPayload): value is JwtPayload {
  return typeof value === "object" && value !== null;
}

export function verifyJwt(token: string): VerifiedJwt {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, requireJwtSecret(), {
      algorithms: ["HS256"]
    });
  } catch {
    throw new HttpError(401, "Invalid or expired token", "JWT_INVALID");
  }

  if (!isJwtPayload(decoded) || typeof decoded.sub !== "string") {
    throw new HttpError(401, "Invalid token payload", "JWT_INVALID_PAYLOAD");
  }

  return {
    expiresAt: decoded.exp,
    issuedAt: decoded.iat,
    userId: decoded.sub,
    username: typeof decoded.username === "string" ? decoded.username : undefined
  };
}
