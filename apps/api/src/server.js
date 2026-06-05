import express from "express";

const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8080", 10);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "api",
    status: "ok"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok"
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled API error", {
    name: err?.name,
    code: err?.code,
    message: err?.message,
    stack: err?.stack
  });

  res.status(500).json({
    error: {
      message: "Internal server error"
    }
  });
});

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
