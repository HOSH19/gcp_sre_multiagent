export const REQUIRED_CONFIG_KEY = process.env.REQUIRED_CONFIG_KEY ?? "APP_SECRET";
export const CHAOS_ADMIN_TOKEN = process.env.CHAOS_ADMIN_TOKEN ?? "dev-chaos-token";
export const PORT = Number(process.env.PORT ?? process.env.PATIENT_PORT ?? 8081);
export const REVISION_LABEL = process.env.K_REVISION ?? process.env.REVISION_LABEL ?? "local-good";
export const IS_BAD_REVISION = (process.env.IS_BAD_REVISION ?? "false").toLowerCase() === "true";
