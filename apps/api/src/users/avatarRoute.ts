import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware.js";
import { HttpError } from "../http/errors.js";
import { isObjectStorageConfigured, uploadObject } from "../storage/objectStorage.js";

const allowedAvatarTypes = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function contentTypeFromRequest(value: string | undefined): string {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();

  if (!contentType || !allowedAvatarTypes.has(contentType)) {
    throw new HttpError(400, "Avatar must be a GIF, JPEG, PNG, or WebP image");
  }

  return contentType;
}

export const uploadMyAvatar: RequestHandler = async (req, res, next) => {
  try {
    if (!isObjectStorageConfigured()) {
      throw new HttpError(503, "Avatar uploads are not configured");
    }

    const { user } = req as AuthenticatedRequest;
    const contentType = contentTypeFromRequest(req.headers["content-type"]);
    const extension = allowedAvatarTypes.get(contentType);
    const body = req.body;

    if (!extension) {
      throw new HttpError(400, "Avatar image type is not supported");
    }

    if (!Buffer.isBuffer(body) || body.byteLength === 0) {
      throw new HttpError(400, "Avatar image is required");
    }

    const uploadedAvatar = await uploadObject({
      body,
      contentType,
      key: `avatars/${user.id}/${Date.now()}-${randomUUID()}.${extension}`,
      metadata: {
        kind: "avatar",
        userId: user.id
      }
    });

    res.status(201).json({
      avatarUrl: uploadedAvatar.url,
      objectKey: uploadedAvatar.key
    });
  } catch (error) {
    next(error);
  }
};
