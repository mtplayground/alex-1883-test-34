import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { isObjectStorageConfigured, uploadObject } from "../storage/objectStorage.js";

const MAX_CAPTION_LENGTH = 2_200;
const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024;
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

function parsePostImage(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file || file.buffer.byteLength === 0) {
    throw new HttpError(400, "Post image is required");
  }

  return file;
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
      select: {
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
      }
    });

    res.status(201).json({
      post
    });
  } catch (error) {
    next(error);
  }
};

export const postRouter = Router();

postRouter.post("/", requireAuth, parsePostUpload, createPost);
