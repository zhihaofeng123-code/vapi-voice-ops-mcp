import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

const cwd = process.cwd();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const appConfig = {
  vapiApiKey: getRequiredEnv("VAPI_API_KEY"),
  vapiBaseUrl: process.env.VAPI_BASE_URL ?? "https://api.vapi.ai",
  defaultAssistantId: process.env.VAPI_ASSISTANT_ID ?? "",
  webhookPort: Number(process.env.WEBHOOK_PORT ?? 8787),
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  dataDir: path.resolve(cwd, process.env.DATA_DIR ?? "./data")
};

