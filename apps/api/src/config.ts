export const config = {
  mode: (process.env.MODE ?? "local") as "local" | "gcp",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 8080),
  projectId: process.env.GCP_PROJECT_ID ?? "local-project",
  region: process.env.GCP_REGION ?? "us-central1",
  webOrigin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:3000",
  patientHealthUrl: process.env.PATIENT_HEALTH_URL ?? "http://127.0.0.1:8081/health",
  patientServiceName: process.env.PATIENT_SERVICE_NAME ?? "patient",
  chaosControllerUrl: process.env.CHAOS_CONTROLLER_URL ?? "http://127.0.0.1:8082",
  chaosAdminToken: process.env.CHAOS_ADMIN_TOKEN ?? "dev-chaos-token",
  flashLiteModel: process.env.GEMINI_FLASH_LITE_MODEL ?? "gemini-2.0-flash-lite",
  flashModel: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.0-flash",
  vertexLocation: process.env.VERTEX_LOCATION ?? "us-central1",
};
