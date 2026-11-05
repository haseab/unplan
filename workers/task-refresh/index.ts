export type RefreshWorkerEnv = { TASK_REFRESH_URL: string; TASK_REFRESH_SECRET: string };

export async function triggerTaskRefresh(env: RefreshWorkerEnv, fetcher: typeof fetch = fetch) {
  const response = await fetcher(env.TASK_REFRESH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TASK_REFRESH_SECRET}` },
    signal: AbortSignal.timeout(55_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Task refresh returned HTTP ${response.status}`);
  const result = await response.json();
  console.info("[TASK-REFRESH:TRIGGER]", result);
  return result;
}

const worker = {
  async scheduled(_event: unknown, env: RefreshWorkerEnv) {
    await triggerTaskRefresh(env);
  },
};

export default worker;
