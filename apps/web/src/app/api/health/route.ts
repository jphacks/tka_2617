import { apiClient } from "@/server/api";

export async function GET() {
  try {
    const res = await apiClient().health.$get();
    return Response.json(await res.json(), { status: res.status });
  } catch {
    // api の内部情報をブラウザに出さない
    return Response.json({ ok: false }, { status: 502 });
  }
}
