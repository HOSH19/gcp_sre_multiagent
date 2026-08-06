import type { SoakJob } from "./soakMemory.js";
import {
  soakDocPath,
  SOAK_LOCK_SCOPE,
  stripUndefined,
} from "./firestoreClient.js";
import { pruneHolders, readLock } from "./firestoreLocks.js";

export async function firestoreSaveSoak(job: SoakJob): Promise<void> {
  await soakDocPath(job.id).set(stripUndefined({ ...job }), { merge: true });
}

export async function firestoreGetSoak(id: string): Promise<SoakJob | undefined> {
  const snap = await soakDocPath(id).get();
  if (!snap.exists) return undefined;
  return { id: snap.id, ...(snap.data() as Omit<SoakJob, "id">) };
}

export async function firestoreGetActiveSoakId(): Promise<string | null> {
  const lock = await readLock(SOAK_LOCK_SCOPE);
  const live = pruneHolders(lock?.holders ?? []);
  return live[0]?.runId ?? null;
}
