import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "#src/lib/env";
import { health } from "#src/routes/health";

// /v1 は web（BFF）からだけ呼ばれる想定なので、共有トークンが無ければ弾く。
// ルートは .route("/garments", garments) のように、この式へつなげて足す。
// 別の文で足すと、web から型が見えなくなる（https://hono.dev/docs/guides/rpc）
const v1 = new Hono().use(bearerAuth({ token: env.INTERNAL_API_TOKEN }));

export const app = new Hono().route("/health", health).route("/v1", v1);

export type AppType = typeof app;
