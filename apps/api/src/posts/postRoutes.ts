import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { isObjectStorageConfigured, uploadObject } from "../storage/objectStorage.js";

const MAX_CAPTION_LENGTH = 2_200;
const MAX_COMMENT_BODY_LENGTH = 1_000;
const MAX_COMMENT_LIST_LIMIT = 100;
const MAX_POST_LIST_LIMIT = 60;
const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024;
const DEFAULT_COMMENT_LIST_LIMIT = 30;
const DEFAULT_POST_LIST_LIMIT = 30;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const allowedPostImageTypes = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const postImageUpload = multer({
  fileFilter: (_req, file, callback) => {
    if (!allowedPostImageTypes.has(file.mimetype)) {
      callback(
        new HttpError(400, "Post image must be a GIF, JPEG, PNG, or WebP image")
      );
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: MAX_POST_IMAGE_SIZE,
    files: 1,
    fields: 1
  },
  storage: multer.memoryStorage()
}).single("image");

const postSelect = {
  _count: {
    select: {
      likes: true
    }
  },
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

const commentSelect = {
  body: true,
  createdAt: true,
  id: true,
  postId: true,
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

type SelectedPost = Prisma.PostGetPayload<{
  select: typeof postSelect;
}>;

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

function parseCaption(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "Caption must be a string");
  }

  const caption = value.trim();

  if (!caption) {
    return null;
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new HttpError(
      400,
      `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer`
    );
  }

  return caption;
}

function parseCommentBody(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "Comment body must be a string", "INVALID_COMMENT");
  }

  const body = value.trim();

  if (!body) {
    throw new HttpError(400, "Comment body is required", "INVALID_COMMENT");
  }

  if (body.length > MAX_COMMENT_BODY_LENGTH) {
    throw new HttpError(
      400,
      `Comment body must be ${MAX_COMMENT_BODY_LENGTH} characters or fewer`,
      "INVALID_COMMENT"
    );
  }

  return body;
}

function parsePostId(value: string | undefined): string {
  const postId = value?.trim();

  if (!postId) {
    throw new HttpError(400, "Post id is required");
  }

  return postId;
}

function parsePostImage(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file || file.buffer.byteLength === 0) {
    throw new HttpError(400, "Post image is required");
  }

  return file;
}

function parseCommentListLimit(value: unknown): number {
  const rawLimit = parseOptionalQueryString(value, "limit");

  if (!rawLimit) {
    return DEFAULT_COMMENT_LIST_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, "limit must be a positive integer");
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (limit < 1 || limit > MAX_COMMENT_LIST_LIMIT) {
    throw new HttpError(400, `limit must be between 1 and ${MAX_COMMENT_LIST_LIMIT}`);
  }

  return limit;
}

function parsePostListLimit(value: unknown): number {
  const rawLimit = parseOptionalQueryString(value, "limit");

  if (!rawLimit) {
    return DEFAULT_POST_LIST_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, "limit must be a positive integer");
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (limit < 1 || limit > MAX_POST_LIST_LIMIT) {
    throw new HttpError(400, `limit must be between 1 and ${MAX_POST_LIST_LIMIT}`);
  }

  return limit;
}

function parseUsernameParam(value: string | undefined): string {
  const username = value?.toLowerCase();

  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "Invalid username", "INVALID_USERNAME");
  }

  return username;
}

function serializePost(post: SelectedPost) {
  const { _count, ...postFields } = post;

  return {
    ...postFields,
    counts: {
      likes: _count.likes
    }
  };
}

async function getPostLikeCount(postId: string): Promise<number> {
  return prisma.like.count({
    where: {
      postId
    }
  });
}

async function ensurePostExists(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    select: {
      id: true
    },
    where: {
      id: postId
    }
  });

  if (!post) {
    throw new HttpError(404, "Post not found", "POST_NOT_FOUND");
  }
}

async function parseCommentCursor(
  value: unknown,
  postId: string
): Promise<{ createdAt: Date; id: string } | null> {
  const cursor = parseOptionalQueryString(value, "cursor");

  if (!cursor) {
    return null;
  }

  const comment = await prisma.comment.findFirst({
    select: {
      createdAt: true,
      id: true
    },
    where: {
      id: cursor,
      postId
    }
  });

  if (!comment) {
    throw new HttpError(400, "Invalid comment cursor", "INVALID_COMMENT_CURSOR");
  }

  return comment;
}

const parsePostUpload: RequestHandler = (req, res, next) => {
  postImageUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new HttpError(400, error.message, "INVALID_POST_UPLOAD"));
      return;
    }

    next(error);
  });
};

export const getPost: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const post = await prisma.post.findUnique({
      select: postSelect,
      where: {
        id: postId
      }
    });

    if (!post) {
      throw new HttpError(404, "Post not found", "POST_NOT_FOUND");
    }

    res.json({
      post: serializePost(post)
    });
  } catch (error) {
    next(error);
  }
};

export const listPostsByUser: RequestHandler = async (req, res, next) => {
  try {
    const username = parseUsernameParam(req.params.username);
    const limit = parsePostListLimit(req.query.limit);
    const cursor = parseOptionalQueryString(req.query.cursor, "cursor");
    const user = await prisma.user.findUnique({
      select: {
        id: true
      },
      where: {
        username
      }
    });

    if (!user) {
      throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    }

    const cursorPost = cursor
      ? await prisma.post.findFirst({
          select: {
            createdAt: true,
            id: true
          },
          where: {
            id: cursor,
            userId: user.id
          }
        })
      : null;

    if (cursor && !cursorPost) {
      throw new HttpError(400, "Invalid post cursor", "INVALID_POST_CURSOR");
    }

    const posts = await prisma.post.findMany({
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      select: postSelect,
      take: limit + 1,
      where: cursorPost
        ? {
            OR: [
              {
                createdAt: {
                  lt: cursorPost.createdAt
                }
              },
              {
                createdAt: cursorPost.createdAt,
                id: {
                  lt: cursorPost.id
                }
              }
            ],
            userId: user.id
          }
        : {
            userId: user.id
          }
    });
    const pagePosts = posts.slice(0, limit);

    res.json({
      nextCursor: posts.length > limit ? pagePosts.at(-1)?.id : null,
      posts: pagePosts.map(serializePost)
    });
  } catch (error) {
    next(error);
  }
};

const listCommentsForPost: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const limit = parseCommentListLimit(req.query.limit);

    await ensurePostExists(postId);

    const cursor = await parseCommentCursor(req.query.cursor, postId);

    const comments = await prisma.comment.findMany({
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      select: commentSelect,
      take: limit + 1,
      where: cursor
        ? {
            OR: [
              {
                createdAt: {
                  gt: cursor.createdAt
                }
              },
              {
                createdAt: cursor.createdAt,
                id: {
                  gt: cursor.id
                }
              }
            ],
            postId
          }
        : {
            postId
          }
    });
    const pageComments = comments.slice(0, limit);

    res.json({
      comments: pageComments,
      nextCursor: comments.length > limit ? pageComments.at(-1)?.id : null
    });
  } catch (error) {
    next(error);
  }
};

const createPost: RequestHandler = async (req, res, next) => {
  try {
    if (!isObjectStorageConfigured()) {
      throw new HttpError(503, "Post image uploads are not configured");
    }

    const { user } = req as AuthenticatedRequest;
    const image = parsePostImage(req.file);
    const caption = parseCaption(req.body.caption);
    const extension = allowedPostImageTypes.get(image.mimetype);

    if (!extension) {
      throw new HttpError(400, "Post image type is not supported");
    }

    const uploadedImage = await uploadObject({
      body: image.buffer,
      contentType: image.mimetype,
      key: `posts/${user.id}/${Date.now()}-${randomUUID()}.${extension}`,
      metadata: {
        kind: "post-image",
        userId: user.id
      }
    });

    const post = await prisma.post.create({
      data: {
        caption,
        imageUrl: uploadedImage.url,
        userId: user.id
      },
      select: postSelect
    });

    res.status(201).json({
      post: serializePost(post)
    });
  } catch (error) {
    next(error);
  }
};

const createComment: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const postId = parsePostId(req.params.postId);
    const body = parseCommentBody(req.body.body);

    await ensurePostExists(postId);

    const comment = await prisma.comment.create({
      data: {
        body,
        postId,
        userId: user.id
      },
      select: commentSelect
    });

    res.status(201).json({
      comment
    });
  } catch (error) {
    next(error);
  }
};

const likePost: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const postId = parsePostId(req.params.postId);

    await ensurePostExists(postId);
    await prisma.like.upsert({
      create: {
        postId,
        userId: user.id
      },
      update: {},
      where: {
        userId_postId: {
          postId,
          userId: user.id
        }
      }
    });

    res.json({
      counts: {
        likes: await getPostLikeCount(postId)
      },
      liked: true,
      postId
    });
  } catch (error) {
    next(error);
  }
};

const unlikePost: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const postId = parsePostId(req.params.postId);

    await ensurePostExists(postId);
    await prisma.like.deleteMany({
      where: {
        postId,
        userId: user.id
      }
    });

    res.json({
      counts: {
        likes: await getPostLikeCount(postId)
      },
      liked: false,
      postId
    });
  } catch (error) {
    next(error);
  }
};

export const postRouter = Router();

postRouter.post("/:postId/like", requireAuth, likePost);
postRouter.delete("/:postId/like", requireAuth, unlikePost);
postRouter.get("/:postId/comments", listCommentsForPost);
postRouter.post("/:postId/comments", requireAuth, createComment);
postRouter.get("/:postId", getPost);
postRouter.post("/", requireAuth, parsePostUpload, createPost);
