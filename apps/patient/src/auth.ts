import { CHAOS_ADMIN_TOKEN } from "./config.js";

export function isAuthed(header: (n: string) => string | undefined): boolean {
  const token = header("x-chaos-token") ?? header("authorization")?.replace(/^Bearer\s+/i, "");
  return token === CHAOS_ADMIN_TOKEN;
}
