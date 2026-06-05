import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const apiPort = process.env.PORT ?? "8080";
const webPort = process.env.WEB_PORT ?? "8081";
const host = process.env.HOST ?? "0.0.0.0";
const webHost = process.env.WEB_HOST ?? host;

function spawnProcess(label, args, env = {}) {
  const child = spawn(npmCommand, args, {
    env: {
      ...process.env,
      ...env
    },
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(`${label} failed to start`, error);
  });

  return child;
}

function runCommand(label, args) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(label, args);

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${label} exited with ${signal ? `signal ${signal}` : `code ${code ?? 1}`}`
        )
      );
    });
  });
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
}

async function main() {
  await runCommand("Database migration", ["run", "db:migrate"]);

  const api = spawnProcess("API server", ["run", "start:api"], {
    HOST: host,
    NODE_ENV: "production",
    PORT: apiPort
  });
  const web = spawnProcess("Web server", ["run", "start:web"], {
    WEB_HOST: webHost,
    WEB_PORT: webPort
  });

  const stopAll = () => {
    stopProcess(api);
    stopProcess(web);
  };

  process.on("SIGINT", stopAll);
  process.on("SIGTERM", stopAll);

  for (const [label, child] of [
    ["API server", api],
    ["Web server", web]
  ]) {
    child.on("exit", (code, signal) => {
      stopAll();
      if (code && code !== 0) {
        console.error(
          `${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}`
        );
      }
      process.exit(code ?? (signal ? 1 : 0));
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
