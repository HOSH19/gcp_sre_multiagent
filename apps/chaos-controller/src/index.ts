import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { MODE, PORT } from "./config.js";
import { registerRoutes } from "./routes.js";

const app = new Hono();
registerRoutes(app);
console.log(`chaos-controller listening on :${PORT} mode=${MODE}`);
serve({ fetch: app.fetch, port: PORT });
