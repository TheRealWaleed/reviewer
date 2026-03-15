import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { UsageConfig } from "../types/config.types.js";
import { UsageSnapshotSchema } from "../types/usage.types.js";
import type { UsageSnapshot } from "../types/usage.types.js";

const cfg: UsageConfig = config;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: UsageSnapshot | null = null;

function getFilePath(): string {
  return join(cfg.usageDataDir, "usage.json");
}

export async function loadUsageSnapshot(): Promise<UsageSnapshot | null> {
  try {
    const raw = await readFile(getFilePath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const result = UsageSnapshotSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function persistSnapshot(snapshot: UsageSnapshot): Promise<void> {
  await mkdir(cfg.usageDataDir, { recursive: true });
  await writeFile(getFilePath(), JSON.stringify(snapshot, null, 2));
}

export function scheduleUsagePersist(snapshot: UsageSnapshot): void {
  pendingSnapshot = snapshot;
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    const toWrite = pendingSnapshot;
    pendingSnapshot = null;
    if (toWrite) {
      await persistSnapshot(toWrite).catch((err) => {
        logger.error({ err }, "Failed to persist usage snapshot (scheduled)");
      });
    }
  }, 10_000);
}

export async function flushPendingPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingSnapshot) {
    await persistSnapshot(pendingSnapshot).catch((err) => {
      logger.error({ err }, "Failed to persist usage snapshot (flush)");
    });
    pendingSnapshot = null;
  }
}
