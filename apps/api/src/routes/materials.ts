import { Hono } from "hono";
import { listMaterials } from "#src/services/list-materials";

export const materials = new Hono().get("/", async (c) =>
  c.json(await listMaterials()),
);
