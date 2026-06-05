import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/authMiddleware.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const MAX_BIO_LENGTH = 500;
const MAX_AVATAR_URL_LENGTH = 2048;

const updateProfileSchema = z
  .object({
    avatarUrl: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z
          .union([z.literal(""), z.string().url().max(MAX_AVATAR_URL_LENGTH), z.null()])
          .optional()
      )
      .transform((value) => (value === "" ? null : value)),
    bio: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.union([z.string().max(MAX_BIO_LENGTH), z.null()]).optional()
      )
      .transform((value) => (value === "" ? null : value)),
    username: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
      z
        .string()
        .regex(
          USERNAME_PATTERN,
          "Username must be 3-24 lowercase letters, numbers, or underscores"
        )
        .optional()
    )
  })
  .strict()
  .refine(
    (value) =>
      value.avatarUrl !== undefined ||
      value.bio !== undefined ||
      value.username !== undefined,
    "At least one profile field is required"
  );

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

function parseProfileUpdate(body: unknown): UpdateProfileInput {
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new HttpError(400, details, "INVALID_PROFILE_UPDATE");
  }

  return parsed.data;
}

function isUniqueUsernameError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("username")
  );
}

export const getMe: RequestHandler = (req, res) => {
  const { user } = req as AuthenticatedRequest;

  res.json({
    user
  });
};

export const patchMe: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const profileUpdate = parseProfileUpdate(req.body);
    const updatedUser = await prisma.user.update({
      data: {
        avatarUrl: profileUpdate.avatarUrl,
        bio: profileUpdate.bio,
        username: profileUpdate.username
      },
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
        id: user.id
      }
    });

    res.json({
      user: updatedUser
    });
  } catch (error) {
    if (isUniqueUsernameError(error)) {
      next(new HttpError(409, "Username is already taken", "USERNAME_TAKEN"));
      return;
    }

    next(error);
  }
};
