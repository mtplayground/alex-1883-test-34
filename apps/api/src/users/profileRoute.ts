import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";

const DEFAULT_USER_LIST_LIMIT = 50;
const MAX_USER_LIST_LIMIT = 100;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

type ProfileCounts = {
  followers: number;
  following: number;
  posts: number;
};

const userListSelect = {
  avatarUrl: true,
  bio: true,
  createdAt: true,
  id: true,
  updatedAt: true,
  username: true
} as const;

function parseOptionalQueryString(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string`);
  }

  const normalized = value.trim();

  return normalized || undefined;
}

function parseUsernameParam(value: string | undefined): string {
  const username = value?.toLowerCase();

  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "Invalid username", "INVALID_USERNAME");
  }

  return username;
}

function parseUserListLimit(value: unknown): number {
  const rawLimit = parseOptionalQueryString(value, "limit");

  if (!rawLimit) {
    return DEFAULT_USER_LIST_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, "limit must be a positive integer");
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (limit < 1 || limit > MAX_USER_LIST_LIMIT) {
    throw new HttpError(400, `limit must be between 1 and ${MAX_USER_LIST_LIMIT}`);
  }

  return limit;
}

async function findUserByUsername(username: string) {
  const user = await prisma.user.findUnique({
    select: userListSelect,
    where: {
      username
    }
  });

  if (!user) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }

  return user;
}

async function getFollowCounts(
  userId: string
): Promise<Pick<ProfileCounts, "followers" | "following">> {
  const [followers, following] = await Promise.all([
    prisma.follow.count({
      where: {
        followingId: userId
      }
    }),
    prisma.follow.count({
      where: {
        followerId: userId
      }
    })
  ]);

  return {
    followers,
    following
  };
}

export const getUserProfile: RequestHandler = async (req, res, next) => {
  try {
    const username = parseUsernameParam(req.params.username);
    const user = await prisma.user.findUnique({
      select: {
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true
          }
        },
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

    const { _count, ...profileUser } = user;

    res.json({
      counts: {
        followers: _count.followers,
        following: _count.following,
        posts: _count.posts
      },
      user: profileUser
    });
  } catch (error) {
    next(error);
  }
};

export const followUser: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const username = parseUsernameParam(req.params.username);
    const targetUser = await findUserByUsername(username);

    if (targetUser.id === user.id) {
      throw new HttpError(400, "You cannot follow yourself", "SELF_FOLLOW");
    }

    await prisma.follow.upsert({
      create: {
        followerId: user.id,
        followingId: targetUser.id
      },
      update: {},
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUser.id
        }
      }
    });

    res.json({
      counts: await getFollowCounts(targetUser.id),
      followed: true,
      user: targetUser
    });
  } catch (error) {
    next(error);
  }
};

export const unfollowUser: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const username = parseUsernameParam(req.params.username);
    const targetUser = await findUserByUsername(username);

    if (targetUser.id === user.id) {
      throw new HttpError(400, "You cannot unfollow yourself", "SELF_FOLLOW");
    }

    await prisma.follow.deleteMany({
      where: {
        followerId: user.id,
        followingId: targetUser.id
      }
    });

    res.json({
      counts: await getFollowCounts(targetUser.id),
      followed: false,
      user: targetUser
    });
  } catch (error) {
    next(error);
  }
};

export const listFollowers: RequestHandler = async (req, res, next) => {
  try {
    const username = parseUsernameParam(req.params.username);
    const limit = parseUserListLimit(req.query.limit);
    const cursor = parseOptionalQueryString(req.query.cursor, "cursor");
    const user = await findUserByUsername(username);
    const cursorFollow = cursor
      ? await prisma.follow.findFirst({
          select: {
            createdAt: true,
            id: true
          },
          where: {
            followingId: user.id,
            id: cursor
          }
        })
      : null;

    if (cursor && !cursorFollow) {
      throw new HttpError(400, "Invalid follower cursor", "INVALID_FOLLOW_CURSOR");
    }

    const follows = await prisma.follow.findMany({
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      select: {
        follower: {
          select: userListSelect
        },
        id: true
      },
      take: limit + 1,
      where: cursorFollow
        ? {
            OR: [
              {
                createdAt: {
                  lt: cursorFollow.createdAt
                }
              },
              {
                createdAt: cursorFollow.createdAt,
                id: {
                  lt: cursorFollow.id
                }
              }
            ],
            followingId: user.id
          }
        : {
            followingId: user.id
          }
    });
    const pageFollows = follows.slice(0, limit);

    res.json({
      nextCursor: follows.length > limit ? pageFollows.at(-1)?.id : null,
      users: pageFollows.map((follow) => follow.follower)
    });
  } catch (error) {
    next(error);
  }
};

export const listFollowing: RequestHandler = async (req, res, next) => {
  try {
    const username = parseUsernameParam(req.params.username);
    const limit = parseUserListLimit(req.query.limit);
    const cursor = parseOptionalQueryString(req.query.cursor, "cursor");
    const user = await findUserByUsername(username);
    const cursorFollow = cursor
      ? await prisma.follow.findFirst({
          select: {
            createdAt: true,
            id: true
          },
          where: {
            followerId: user.id,
            id: cursor
          }
        })
      : null;

    if (cursor && !cursorFollow) {
      throw new HttpError(400, "Invalid following cursor", "INVALID_FOLLOW_CURSOR");
    }

    const follows = await prisma.follow.findMany({
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      select: {
        following: {
          select: userListSelect
        },
        id: true
      },
      take: limit + 1,
      where: cursorFollow
        ? {
            OR: [
              {
                createdAt: {
                  lt: cursorFollow.createdAt
                }
              },
              {
                createdAt: cursorFollow.createdAt,
                id: {
                  lt: cursorFollow.id
                }
              }
            ],
            followerId: user.id
          }
        : {
            followerId: user.id
          }
    });
    const pageFollows = follows.slice(0, limit);

    res.json({
      nextCursor: follows.length > limit ? pageFollows.at(-1)?.id : null,
      users: pageFollows.map((follow) => follow.following)
    });
  } catch (error) {
    next(error);
  }
};
