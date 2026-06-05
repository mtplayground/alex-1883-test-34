import express, { type ErrorRequestHandler, type RequestHandler } from "express";

const app = express();
const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Invalid PORT value", { port: process.env.PORT });
  process.exit(1);
}

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
  console.error("Unhandled API error", {
    name: err instanceof Error ? err.name : undefined,
    code:
      typeof err === "object" && err !== null && "code" in err ? err.code : undefined,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  res.status(500).json({
    error: {
      message: "Internal server error"
    }
  });
};

app.get("/", rootHandler);
app.get("/api/health", healthHandler);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
