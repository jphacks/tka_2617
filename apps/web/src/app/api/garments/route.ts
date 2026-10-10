import { forwardApi } from "@/server/api";
export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category");
  return forwardApi(
    request,
    `/v1/garments${category ? `?category=${encodeURIComponent(category)}` : ""}`,
  );
}
export async function POST(request: Request) {
  return forwardApi(request, "/v1/garments");
}
