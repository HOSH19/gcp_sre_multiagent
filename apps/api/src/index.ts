import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { registerActionRoutes } from "./routes/actions.js";
import { registerHookRoutes } from "./routes/hooks.js";
import { registerMetaRoutes } from "./routes/meta.js";
import { registerReadRoutes } from "./routes/reads.js";

const app = new Hono();
app.use(
  "*",
  cors({
    origin: [config.webOrigin, "http://localhost:3000", "http://127.0.0.1:3000"],
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

registerMetaRoutes(app);
registerReadRoutes(app);
registerActionRoutes(app);
registerHookRoutes(app);

console.log(`api listening on :${config.port} mode=${config.mode}`);
serve({ fetch: app.fetch, port: config.port });
