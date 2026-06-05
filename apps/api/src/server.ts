import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { authRouter } from "./auth/authRoutes.js";
import { requireAuth } from "./auth/authMiddleware.js";
import { appConfig } from "./config/env.js";
import { isDatabaseConfigured } from "./db/prisma.js";
import { feedRouter } from "./feed/feedRoutes.js";
import { HttpError, errorResponseBody, statusCodeForError } from "./http/errors.js";
import { listPostsByUser, postRouter } from "./posts/postRoutes.js";
import { isObjectStorageConfigured } from "./storage/objectStorage.js";
import { uploadMyAvatar } from "./users/avatarRoute.js";
import { getMe, patchMe } from "./users/meRoute.js";
import {
  followUser,
  getUserProfile,
  listFollowers,
  listFollowing,
  unfollowUser
} from "./users/profileRoute.js";

const app = express();
const { host, port } = appConfig.server;
const allowedCorsOrigins = appConfig.server.corsOrigin
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowsAnyOrigin = allowedCorsOrigins?.includes("*") ?? false;
  const allowsRequestOrigin =
    typeof origin === "string" && allowedCorsOrigins?.includes(origin);

  if (origin && (allowsAnyOrigin || allowsRequestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", allowsAnyOrigin ? "*" : origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "DELETE, GET, OPTIONS, PATCH, POST");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json({ limit: "1mb" }));

const rootHandler: RequestHandler = (_req, res) => {
  res.json({
    service: "api",
    status: "ok"
  });
};

const healthHandler: RequestHandler = (_req, res) => {
  res.json({
    database: {
      configured: isDatabaseConfigured()
    },
    objectStorage: {
      configured: isObjectStorageConfigured()
    },
    status: "ok"
  });
};

const notFoundHandler: RequestHandler = (req, res) => {
  const error = new HttpError(
    404,
    `Route not found: ${req.method} ${req.originalUrl}`,
    "ROUTE_NOT_FOUND"
  );

  res.status(error.statusCode).json(errorResponseBody(error));
};

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = statusCodeForError(err);

  if (statusCode >= 500) {
    console.error("Unhandled API error", {
      name: err instanceof Error ? err.name : undefined,
      code:
        typeof err === "object" && err !== null && "code" in err ? err.code : undefined,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  }

  res.status(statusCode).json(errorResponseBody(err));
};

app.get("/", rootHandler);
app.get("/api/health", healthHandler);
app.get("/me", requireAuth, getMe);
app.patch("/me", requireAuth, patchMe);
app.post(
  "/me/avatar",
  requireAuth,
  express.raw({ limit: "5mb", type: "image/*" }),
  uploadMyAvatar
);
app.get("/users/:username/posts", listPostsByUser);
app.get("/users/:username/followers", listFollowers);
app.get("/users/:username/following", listFollowing);
app.post("/users/:username/follow", requireAuth, followUser);
app.delete("/users/:username/follow", requireAuth, unfollowUser);
app.get("/users/:username", getUserProfile);
app.use("/api/auth", authRouter);
app.use("/feed", feedRouter);
app.use("/posts", postRouter);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
