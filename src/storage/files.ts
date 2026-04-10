import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";
import type { StoredCallRecord, StoredWebhookRecord } from "../types.js";

const callsDir = path.join(appConfig.dataDir, "calls");
const webhooksDir = path.join(appConfig.dataDir, "webhooks");

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function ensureStorage(): Promise<void> {
  await Promise.all([ensureDir(appConfig.dataDir), ensureDir(callsDir), ensureDir(webhooksDir)]);
}

export async function saveCallRecord(record: StoredCallRecord): Promise<void> {
  await ensureStorage();
  await writeJson(path.join(callsDir, `${record.callId}.json`), record);
}

export async function getCallRecord(callId: string): Promise<StoredCallRecord | null> {
  return readJson<StoredCallRecord>(path.join(callsDir, `${callId}.json`));
}

export async function listCallRecords(limit = 20): Promise<StoredCallRecord[]> {
  await ensureStorage();
  const files = await fs.readdir(callsDir);
  const records = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson<StoredCallRecord>(path.join(callsDir, file)))
  );

  return records
    .filter((record): record is StoredCallRecord => Boolean(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function saveWebhookRecord(record: StoredWebhookRecord): Promise<void> {
  await ensureStorage();
  await writeJson(path.join(webhooksDir, `${record.id}.json`), record);
}

export async function listWebhookRecords(limit = 20): Promise<StoredWebhookRecord[]> {
  await ensureStorage();
  const files = await fs.readdir(webhooksDir);
  const records = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson<StoredWebhookRecord>(path.join(webhooksDir, file)))
  );

  return records
    .filter((record): record is StoredWebhookRecord => Boolean(record))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, limit);
}
