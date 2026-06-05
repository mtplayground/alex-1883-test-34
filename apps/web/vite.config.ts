import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const host = process.env.WEB_HOST ?? "0.0.0.0";
const port = readPort(process.env.WEB_PORT, 8080);

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port
  },
  preview: {
    host,
    port
  }
});
