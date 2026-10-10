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

// 中継先はRoute Handlerが固定する。ブラウザから任意のURLは受け取らない。
export async function forwardApi(
  request: Request,
  path: string,
): Promise<Response> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${requireEnv("INTERNAL_API_TOKEN")}`,
    };
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (request.method !== "GET" && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 18 * 1024 * 1024) {
          await reader.cancel();
          return Response.json(
            { error: "送信する画像が大きすぎます" },
            { status: 413 },
          );
        }
        chunks.push(chunk.value);
      }
      body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      headers["Content-Type"] =
        request.headers.get("content-type") ?? "application/json";
    }
    const response = await fetch(new URL(path, requireEnv("API_URL")), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(125_000),
    });
    if (response.status === 204) return new Response(null, { status: 204 });
    if (!response.ok) {
      if ([400, 404, 413, 429, 503].includes(response.status)) {
        const value: unknown = await response.json();
        if (
          typeof value === "object" &&
          value !== null &&
          "error" in value &&
          typeof value.error === "string" &&
          value.error.length <= 200
        )
          return Response.json(
            { error: value.error },
            { status: response.status },
          );
      }
      return Response.json(
        { error: "処理に失敗しました。設定と入力を確認してください" },
        { status: 502 },
      );
    }
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (contentType === "image/jpeg" || contentType === "image/png") {
      return new Response(response.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const value: unknown = await response.json();
    return Response.json(value, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "APIに接続できません。サーバーの起動を確認してください" },
      { status: 502 },
    );
  }
}
