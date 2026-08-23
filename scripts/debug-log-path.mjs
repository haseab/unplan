import { createHash } from "node:crypto";
import { lstat, mkdir, readlink, rename, symlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEBUG_LOG_ENV = "UNPLAN_DEBUG_LOG_PATH";

function isOutsideProject(projectRoot, candidatePath) {
  const projectRelativePath = relative(projectRoot, candidatePath);
  return (
    projectRelativePath === ".." ||
    projectRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(projectRelativePath)
  );
}

function runtimeLogPath(projectRoot) {
  const projectKey = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  return join(tmpdir(), "unplan-debug-logs", `${basename(projectRoot)}-${projectKey}.log`);
}

export async function prepareDebugLog(projectRoot = process.cwd()) {
  const publicLogPath = resolve(projectRoot, "debug.log");
  const configuredLogPath = process.env[DEBUG_LOG_ENV];
  if (configuredLogPath) {
    return { logPath: resolve(configuredLogPath), publicLogPath };
  }

  let existingEntry;
  try {
    existingEntry = await lstat(publicLogPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (existingEntry?.isSymbolicLink()) {
    const linkTarget = await readlink(publicLogPath);
    const resolvedTarget = resolve(dirname(publicLogPath), linkTarget);
    if (isOutsideProject(projectRoot, resolvedTarget)) {
      await mkdir(dirname(resolvedTarget), { recursive: true });
      process.env[DEBUG_LOG_ENV] = resolvedTarget;
      return { logPath: resolvedTarget, publicLogPath };
    }

    throw new Error(
      `debug.log points inside the project and would trigger the dev watcher: ${resolvedTarget}`,
    );
  }

  const defaultLogPath = runtimeLogPath(projectRoot);
  const logPath = existingEntry
    ? `${defaultLogPath}.${Date.now()}-${process.pid}`
    : defaultLogPath;
  await mkdir(dirname(logPath), { recursive: true });

  if (existingEntry) {
    if (!existingEntry.isFile()) {
      throw new Error(`Cannot replace non-file debug log entry: ${publicLogPath}`);
    }
    await rename(publicLogPath, logPath);
  }

  await symlink(logPath, publicLogPath);
  process.env[DEBUG_LOG_ENV] = logPath;
  return { logPath, publicLogPath };
}
