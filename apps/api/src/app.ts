import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "#src/lib/env";
import { health } from "#src/routes/health";

const v1 = new Hono();

// /v1 は web（BFF）からだけ呼ばれる想定なので、共有トークンが無ければ弾く
export const app = new Hono()
  .route("/health", health)
  .use("/v1/*", bearerAuth({ token: env.INTERNAL_API_TOKEN }))
  .route("/v1", v1);

export type AppType = typeof app;
