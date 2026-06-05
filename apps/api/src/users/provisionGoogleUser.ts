import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { GoogleUserProfile } from "../auth/googleOAuth.js";

type ProvisionedUser = {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
  email: string;
  googleId: string;
  id: string;
  updatedAt: Date;
  username: string;
};

const MAX_USERNAME_LENGTH = 24;

function buildUsernameBase(profile: GoogleUserProfile): string {
  const source = profile.email.split("@")[0] || profile.name || "user";
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_USERNAME_LENGTH);

  return normalized.length >= 3 ? normalized : `user_${profile.sub.slice(0, 8)}`;
}

function usernameForAttempt(base: string, attempt: number): string {
  if (attempt === 0) {
    return base;
  }

  const suffix = `_${attempt}`;
  return `${base.slice(0, MAX_USERNAME_LENGTH - suffix.length)}${suffix}`;
}

function isUniqueConstraintError(error: unknown, fieldName: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(fieldName)
  );
}

export async function provisionGoogleUser(
  profile: GoogleUserProfile
): Promise<ProvisionedUser> {
  const existingUser = await prisma.user.findUnique({
    where: {
      googleId: profile.sub
    }
  });

  if (existingUser) {
    return prisma.user.update({
      data: {
        avatarUrl: profile.picture,
        email: profile.email
      },
      where: {
        id: existingUser.id
      }
    });
  }

  const usernameBase = buildUsernameBase(profile);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const username = usernameForAttempt(usernameBase, attempt);

    try {
      return await prisma.user.create({
        data: {
          avatarUrl: profile.picture,
          email: profile.email,
          googleId: profile.sub,
          username
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error, "username")) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to allocate a unique username");
}
