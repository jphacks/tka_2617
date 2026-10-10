import { forwardApi } from "@/server/api";
export async function GET(request: Request) {
  return forwardApi(request, "/v1/measurements");
}
export async function POST(request: Request) {
  return forwardApi(request, "/v1/measurements");
}
