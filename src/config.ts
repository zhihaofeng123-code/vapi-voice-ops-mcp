import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

const cwd = process.cwd();

export const appConfig = {
  vapiApiKey: process.env.VAPI_API_KEY ?? "",
  vapiBaseUrl: process.env.VAPI_BASE_URL ?? "https://api.vapi.ai",
  defaultAssistantId: process.env.VAPI_ASSISTANT_ID ?? "",
  port: Number(process.env.PORT ?? process.env.WEBHOOK_PORT ?? 8787),
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  dataDir: path.resolve(cwd, process.env.DATA_DIR ?? "./data")
};
