import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { prepareDebugLog } from "./debug-log-path.mjs";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  process.stderr.write("Usage: run-with-debug-log.mjs <command> [...args]\n");
  process.exit(1);
}

const { logPath } = await prepareDebugLog();
const log = createWriteStream(logPath, { flags: "a" });
const commandFlag = command.replace(/[^a-z0-9_-]/gi, "-").toUpperCase();
const heading = `\n[${new Date().toISOString()}] [PROCESS] [INFO] [COMMAND:${commandFlag}] $ ${[command, ...args].join(" ")}\n`;

process.stdout.write(heading);
log.write(heading);

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

const mirror = (stream, destination, level) => {
  let pending = "";
  stream.on("data", (chunk) => {
    destination.write(chunk);
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) {
        log.write(
          `[${new Date().toISOString()}] [PROCESS] [${level}] [COMMAND:${commandFlag}] ${line}\n`,
        );
      }
    }
  });

  return () => {
    if (pending.length > 0) {
      log.write(
        `[${new Date().toISOString()}] [PROCESS] [${level}] [COMMAND:${commandFlag}] ${pending}\n`,
      );
    }
  };
};

const flushStdout = mirror(child.stdout, process.stdout, "STDOUT");
const flushStderr = mirror(child.stderr, process.stderr, "STDERR");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  const message = `[${new Date().toISOString()}] [PROCESS] [ERROR] [COMMAND:${commandFlag}] ${error.stack ?? error.message}\n`;
  process.stderr.write(message);
  log.end(message, () => process.exit(1));
});

child.on("close", (code, signal) => {
  flushStdout();
  flushStderr();
  const result = `[${new Date().toISOString()}] [PROCESS] [INFO] [EXIT:${commandFlag}] exited ${signal ?? code ?? 1}\n`;
  log.end(result, () => process.exit(code ?? 1));
});
