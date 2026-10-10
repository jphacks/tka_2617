import { forwardApi } from "@/server/api";
export async function POST(request: Request) {
  return forwardApi(request, "/v1/detections");
}
