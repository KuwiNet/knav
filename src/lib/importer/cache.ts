import type { ImportSnapshot } from "./types";

/**
 * 扫描快照的临时缓存。
 *
 * 快照可能有几千条内容，全塞进 Server Action 的返回值不现实，
 * 所以扫描时留在服务端，只把「可选清单」发给页面；点「开始导入」时凭 jobId 取回。
 *
 * 服务进程重启后缓存会丢，这时让用户重新扫描即可。
 */

const TTL = 30 * 60 * 1000;
const MAX_JOBS = 10;

const store = new Map<string, { snapshot: ImportSnapshot; at: number }>();

/** 存一份快照，返回 jobId */
export function putSnapshot(snapshot: ImportSnapshot): string {
  const jobId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  store.set(jobId, { snapshot, at: Date.now() });

  if (store.size > MAX_JOBS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
  return jobId;
}

/** 取回快照；过期或不存在返回 null */
export function getSnapshot(jobId: string): ImportSnapshot | null {
  const hit = store.get(jobId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL) {
    store.delete(jobId);
    return null;
  }
  return hit.snapshot;
}
