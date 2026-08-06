import { Timestamp } from "@google-cloud/firestore";
import { nowIso } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  getFirestore,
  lockDocPath,
  type LeaseHolder,
  type LockDoc,
} from "./firestoreClient.js";

function pruneHolders(holders: LeaseHolder[], now = Date.now()): LeaseHolder[] {
  return holders.filter((h) => Date.parse(h.expiresAt) > now);
}

async function readLock(scope: string): Promise<LockDoc | null> {
  const snap = await lockDocPath(scope).get();
  if (!snap.exists) return null;
  const data = snap.data() as LockDoc;
  return { scope, holders: data.holders ?? [], updatedAt: data.updatedAt ?? nowIso() };
}

/**
 * Transactional lease acquire for investigation (or soak) scope.
 * `runId` identifies the holder; for soaks the soak id is stored in runId.
 */
export async function firestoreTryAcquireLease(
  scope: string,
  runId: string,
  maxConcurrent: number,
): Promise<boolean> {
  const db = getFirestore();
  const ref = lockDocPath(scope);
  const expiresAt = new Date(Date.now() + config.leaseTtlMs).toISOString();
  const acquiredAt = nowIso();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as LockDoc) : null;
    let holders = pruneHolders(existing?.holders ?? []);

    const mine = holders.find((h) => h.runId === runId);
    if (mine) {
      mine.ownerId = config.instanceId;
      mine.expiresAt = expiresAt;
      tx.set(
        ref,
        {
          scope,
          holders,
          updatedAt: nowIso(),
          expiresAtTs: Timestamp.fromDate(new Date(expiresAt)),
        },
        { merge: true },
      );
      return true;
    }

    if (holders.length >= maxConcurrent) return false;

    holders = [
      ...holders,
      { runId, ownerId: config.instanceId, expiresAt, acquiredAt },
    ];
    tx.set(ref, {
      scope,
      holders,
      updatedAt: nowIso(),
      expiresAtTs: Timestamp.fromDate(new Date(expiresAt)),
    });
    return true;
  });
}

export async function firestoreReleaseLease(scope: string, runId: string): Promise<void> {
  const db = getFirestore();
  const ref = lockDocPath(scope);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as LockDoc;
    const holders = pruneHolders(data.holders ?? []).filter((h) => h.runId !== runId);
    tx.set(ref, { scope, holders, updatedAt: nowIso() }, { merge: true });
  });
}

export async function firestoreGetActiveLeaseRunId(scope: string): Promise<string | null> {
  const lock = await readLock(scope);
  const live = pruneHolders(lock?.holders ?? []);
  return live[0]?.runId ?? null;
}

export async function firestoreListActiveLeases(scope: string): Promise<LeaseHolder[]> {
  const lock = await readLock(scope);
  return pruneHolders(lock?.holders ?? []);
}

export async function firestoreCountActiveLeases(scope: string): Promise<number> {
  const lock = await readLock(scope);
  return pruneHolders(lock?.holders ?? []).length;
}

export { pruneHolders, readLock };
