import type { ServiceRegistry } from "@gcp-sre/shared";
import {
  CONFIG,
  getFirestore,
  SERVICE_REGISTRY_DOC,
} from "./firestoreClient.js";

/** Fleet registry document at `config/serviceRegistry`. */
export async function firestoreGetServiceRegistry(): Promise<ServiceRegistry | null> {
  const snap = await getFirestore().collection(CONFIG).doc(SERVICE_REGISTRY_DOC).get();
  if (!snap.exists) return null;
  const data = snap.data() as ServiceRegistry;
  if (!data?.services || !Array.isArray(data.services)) return null;
  return data;
}
