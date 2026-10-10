import { forwardApi } from "@/server/api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await context.params;
  return forwardApi(
    request,
    `/v1/garments/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`,
  );
}
