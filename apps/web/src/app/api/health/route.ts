import { apiClient } from "@/server/api";

// api のエラー内容はブラウザに出さず、docs/api.md のエラーの形にそろえる
function unavailable() {
  return Response.json({ error: "api に接続できません" }, { status: 502 });
}

export async function GET() {
  try {
    const res = await apiClient().health.$get();
    if (!res.ok) {
      return unavailable();
    }
    return Response.json(await res.json());
  } catch {
    return unavailable();
  }
}
