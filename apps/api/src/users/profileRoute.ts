import type { RequestHandler } from "express";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

type ProfileCounts = {
  followers: number;
  following: number;
  posts: number;
};

const emptyProfileCounts: ProfileCounts = {
  followers: 0,
  following: 0,
  posts: 0
};

function parseUsernameParam(value: string | undefined): string {
  const username = value?.toLowerCase();

  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "Invalid username", "INVALID_USERNAME");
  }

  return username;
}

export const getUserProfile: RequestHandler = async (req, res, next) => {
  try {
    const username = parseUsernameParam(req.params.username);
    const user = await prisma.user.findUnique({
      select: {
        avatarUrl: true,
        bio: true,
        createdAt: true,
        id: true,
        updatedAt: true,
        username: true
      },
      where: {
        username
      }
    });

    if (!user) {
      throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    }

    res.json({
      counts: emptyProfileCounts,
      user
    });
  } catch (error) {
    next(error);
  }
};
