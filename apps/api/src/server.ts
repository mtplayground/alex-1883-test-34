import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { authRouter } from "./auth/authRoutes.js";
import { requireAuth } from "./auth/authMiddleware.js";
import { appConfig } from "./config/env.js";
import { isDatabaseConfigured } from "./db/prisma.js";
import { isHttpError } from "./http/errors.js";
import { isObjectStorageConfigured } from "./storage/objectStorage.js";
import { uploadMyAvatar } from "./users/avatarRoute.js";
import { getMe, patchMe } from "./users/meRoute.js";
import { getUserProfile } from "./users/profileRoute.js";

const app = express();
const { host, port } = appConfig.server;

app.disable("x-powered-by");
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
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
};

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = isHttpError(err) ? err.statusCode : 500;

  console.error("Unhandled API error", {
    name: err instanceof Error ? err.name : undefined,
    code:
      typeof err === "object" && err !== null && "code" in err ? err.code : undefined,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  res.status(statusCode).json({
    error: {
      message:
        statusCode >= 500
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : "Request failed"
    }
  });
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
app.get("/users/:username", getUserProfile);
app.use("/api/auth", authRouter);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
