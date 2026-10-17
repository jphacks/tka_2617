import { forwardApi } from "@/server/api";
type Context = { params: Promise<{ id: string }> };
async function forward(request: Request, context: Context) {
  const { id } = await context.params;
  return forwardApi(request, `/v1/garments/${encodeURIComponent(id)}`);
}
export async function GET(request: Request, context: Context) {
  return forward(request, context);
}
export async function PATCH(request: Request, context: Context) {
  return forward(request, context);
}
export async function DELETE(request: Request, context: Context) {
  return forward(request, context);
}
