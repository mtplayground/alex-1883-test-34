import { Prisma } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware.js";
import { requireAuth } from "../auth/authMiddleware.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";

const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 60;

const feedPostSelect = {
  caption: true,
  createdAt: true,
  id: true,
  imageUrl: true,
  updatedAt: true,
  user: {
    select: {
      avatarUrl: true,
      id: true,
      username: true
    }
  },
  userId: true
} as const;

type FeedCursor = {
  createdAt: Date;
  id: string;
};

type FollowedFeedRow = {
  authorAvatarUrl: string | null;
  authorId: string;
  authorUsername: string;
  caption: string | null;
  createdAt: Date;
  id: string;
  imageUrl: string;
  updatedAt: Date;
  userId: string;
};

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

function parseFeedLimit(value: unknown): number {
  const rawLimit = parseOptionalQueryString(value, "limit");

  if (!rawLimit) {
    return DEFAULT_FEED_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, "limit must be a positive integer");
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (limit < 1 || limit > MAX_FEED_LIMIT) {
    throw new HttpError(400, `limit must be between 1 and ${MAX_FEED_LIMIT}`);
  }

  return limit;
}

async function parseFeedCursor(value: unknown): Promise<FeedCursor | null> {
  const cursor = parseOptionalQueryString(value, "cursor");

  if (!cursor) {
    return null;
  }

  const post = await prisma.post.findUnique({
    select: {
      createdAt: true,
      id: true
    },
    where: {
      id: cursor
    }
  });

  if (!post) {
    throw new HttpError(400, "Invalid feed cursor", "INVALID_FEED_CURSOR");
  }

  return post;
}

async function followsTableExists(): Promise<boolean> {
  const [result] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.follows') IS NOT NULL AS exists
  `;

  return result?.exists === true;
}

function mapFollowedFeedRow(row: FollowedFeedRow) {
  return {
    caption: row.caption,
    createdAt: row.createdAt,
    id: row.id,
    imageUrl: row.imageUrl,
    updatedAt: row.updatedAt,
    user: {
      avatarUrl: row.authorAvatarUrl,
      id: row.authorId,
      username: row.authorUsername
    },
    userId: row.userId
  };
}

export const getGlobalFeed: RequestHandler = async (req, res, next) => {
  try {
    const limit = parseFeedLimit(req.query.limit);
    const cursor = await parseFeedCursor(req.query.cursor);
    const posts = await prisma.post.findMany({
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      select: feedPostSelect,
      take: limit + 1,
      where: cursor
        ? {
            OR: [
              {
                createdAt: {
                  lt: cursor.createdAt
                }
              },
              {
                createdAt: cursor.createdAt,
                id: {
                  lt: cursor.id
                }
              }
            ]
          }
        : undefined
    });
    const pagePosts = posts.slice(0, limit);

    res.json({
      nextCursor: posts.length > limit ? pagePosts.at(-1)?.id : null,
      posts: pagePosts
    });
  } catch (error) {
    next(error);
  }
};

export const getFollowedFeed: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const limit = parseFeedLimit(req.query.limit);
    const cursor = await parseFeedCursor(req.query.cursor);

    if (!(await followsTableExists())) {
      res.json({
        nextCursor: null,
        posts: []
      });
      return;
    }

    const rows = await prisma.$queryRaw<FollowedFeedRow[]>`
      SELECT
        p.id,
        p.user_id AS "userId",
        p.image_url AS "imageUrl",
        p.caption,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        u.id AS "authorId",
        u.username AS "authorUsername",
        u.avatar_url AS "authorAvatarUrl"
      FROM posts p
      INNER JOIN users u ON u.id = p.user_id
      INNER JOIN follows f ON f.following_id = p.user_id
      WHERE f.follower_id = ${user.id}
        ${
          cursor
            ? Prisma.sql`AND (
                p.created_at < ${cursor.createdAt}
                OR (p.created_at = ${cursor.createdAt} AND p.id < ${cursor.id})
              )`
            : Prisma.empty
        }
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit + 1}
    `;
    const pageRows = rows.slice(0, limit);

    res.json({
      nextCursor: rows.length > limit ? pageRows.at(-1)?.id : null,
      posts: pageRows.map(mapFollowedFeedRow)
    });
  } catch (error) {
    next(error);
  }
};

export const feedRouter = Router();

feedRouter.get("/global", getGlobalFeed);
feedRouter.get("/followed", requireAuth, getFollowedFeed);
