import { forwardApi } from "@/server/api";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return forwardApi(request, `/v1/garments/${encodeURIComponent(id)}/back`);
}
