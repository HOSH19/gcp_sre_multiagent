import { Hono } from "hono";
import { registerApprovalRoutes } from "./approval.js";
import { registerInvestigateRoutes } from "./investigate.js";
import { registerLabRoutes } from "./lab.js";

export function registerActionRoutes(app: Hono): void {
  registerInvestigateRoutes(app);
  registerApprovalRoutes(app);
  registerLabRoutes(app);
}
