import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { PORT, REVISION_LABEL } from "./config.js";
import { registerChaosRoutes } from "./routes/chaos.js";
import { registerHealthRoutes } from "./routes/health.js";

const app = new Hono();
registerHealthRoutes(app);
registerChaosRoutes(app);

console.log(`patient listening on :${PORT} revision=${REVISION_LABEL}`);
serve({ fetch: app.fetch, port: PORT });
