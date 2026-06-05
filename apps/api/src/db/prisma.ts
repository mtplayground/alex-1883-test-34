import { PrismaClient } from "@prisma/client";
import { appConfig } from "../config/env.js";

const globalForPrisma = globalThis as typeof globalThis & {
  prismaClient?: PrismaClient;
};

export function isDatabaseConfigured(): boolean {
  return Boolean(appConfig.databaseUrl);
}

export function assertDatabaseConfigured(): void {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }
}

export const prisma =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prisma;
}

export async function connectDatabase(): Promise<void> {
  assertDatabaseConfigured();
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
