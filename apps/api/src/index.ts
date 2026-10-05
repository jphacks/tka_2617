import { serve } from "@hono/node-server";
import { app } from "#src/app";
import { env } from "#src/lib/env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api: http://localhost:${String(info.port)}`);
});
