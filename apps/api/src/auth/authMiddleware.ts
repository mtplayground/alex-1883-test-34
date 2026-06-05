import type { Request, RequestHandler } from "express";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { verifyJwt } from "./jwt.js";

export type AuthenticatedUser = {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
  email: string;
  id: string;
  updatedAt: Date;
  username: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

function bearerTokenFromHeader(headerValue: string | undefined): string {
  if (!headerValue) {
    throw new HttpError(401, "Missing Authorization header", "AUTH_REQUIRED");
  }

  const [scheme, token, ...extra] = headerValue.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra.length > 0) {
    throw new HttpError(401, "Invalid Authorization header", "AUTH_INVALID");
  }

  return token;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = bearerTokenFromHeader(req.headers.authorization);
    const verifiedToken = verifyJwt(token);
    const user = await prisma.user.findUnique({
      select: {
        avatarUrl: true,
        bio: true,
        createdAt: true,
        email: true,
        id: true,
        updatedAt: true,
        username: true
      },
      where: {
        id: verifiedToken.userId
      }
    });

    if (!user) {
      throw new HttpError(401, "Authenticated user no longer exists", "AUTH_INVALID");
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch (error) {
    next(error);
  }
};
