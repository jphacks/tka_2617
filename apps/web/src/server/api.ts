import "server-only";
import { hc } from "hono/client";
import type { AppType } from "@pitari/api";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が設定されていません（apps/web/.env.local）`);
  }
  return value;
}

// build 時に環境変数が無くても落ちないよう、呼ばれたときに作る
export function apiClient() {
  return hc<AppType>(requireEnv("API_URL"), {
    headers: { Authorization: `Bearer ${requireEnv("INTERNAL_API_TOKEN")}` },
  });
}
