import { Hono } from "hono";
import { registerApprovalRoutes } from "./approval.js";
import { registerInvestigateRoutes } from "./investigate.js";

export function registerActionRoutes(app: Hono): void {
  registerInvestigateRoutes(app);
  registerApprovalRoutes(app);
}
