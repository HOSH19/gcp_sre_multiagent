import { Firestore, Timestamp, type DocumentData } from "@google-cloud/firestore";
import {
  nowIso,
  type AgentEvent,
  type InvestigationRun,
  type ServiceRegistry,
} from "@gcp-sre/shared";
import { config } from "../config.js";
import type { SoakJob } from "./soakMemory.js";

const RUNS = "runs";
const EVENTS = "events";
const SOAKS = "soaks";
const LOCKS = "locks";
const CONFIG = "config";
const SERVICE_REGISTRY_DOC = "serviceRegistry";

export const INVESTIGATION_LOCK_SCOPE = "investigations";
export const SOAK_LOCK_SCOPE = "soaks";

export interface LeaseHolder {
  runId: string;
  ownerId: string;
  expiresAt: string;
  acquiredAt: string;
}

export interface LockDoc {
  scope: string;
  holders: LeaseHolder[];
  updatedAt: string;
}

let client: Firestore | null = null;

export function getFirestore(): Firestore {
  if (!client) {
    client = new Firestore({ projectId: config.projectId });
  }
  return client;
}

/** Test hook — reset lazy client. */
export function resetFirestoreClient(): void {
  client = null;
}

function runDocPath(runId: string) {
  return getFirestore().collection(RUNS).doc(runId);
}

function eventsCol(runId: string) {
  return runDocPath(runId).collection(EVENTS);
}

function soakDocPath(soakId: string) {
  return getFirestore().collection(SOAKS).doc(soakId);
}

function lockDocPath(scope: string) {
  return getFirestore().collection(LOCKS).doc(scope);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/** Persist run metadata without the inlined events array (events live in subcollection). */
export function runToFirestoreDoc(run: InvestigationRun): DocumentData {
  const { events: _events, ...rest } = run;
  return stripUndefined({
    ...rest,
    eventCount: run.events.length,
    updatedAt: run.updatedAt || nowIso(),
  });
}

function docToRun(id: string, data: DocumentData, events: AgentEvent[]): InvestigationRun {
  const patientService = String(data.patientService ?? data.targetService ?? "");
  const targetService = String(data.targetService ?? data.patientService ?? "");
  return {
    id,
    status: data.status,
    createdAt: String(data.createdAt),
    updatedAt: String(data.updatedAt),
    trigger: data.trigger,
    scenario: data.scenario,
    patientService,
    targetService,
    projectId: data.projectId,
    region: data.region,
    events,
    evidence: data.evidence ?? [],
    hypotheses: data.hypotheses ?? [],
    ruledOut: data.ruledOut ?? [],
    proposedRemediation: data.proposedRemediation ?? null,
    report: data.report ?? null,
    stepCount: Number(data.stepCount ?? 0),
    toolCallCount: Number(data.toolCallCount ?? 0),
    costUsd: Number(data.costUsd ?? 0),
    tokensIn: Number(data.tokensIn ?? 0),
    tokensOut: Number(data.tokensOut ?? 0),
    error: data.error,
    shareUrl: data.shareUrl,
    reportGcsUri: data.reportGcsUri,
    leaseOwner: data.leaseOwner,
    leaseExpiresAt: data.leaseExpiresAt,
    alert: data.alert,
  };
}

export async function firestoreSaveRun(run: InvestigationRun): Promise<void> {
  await runDocPath(run.id).set(runToFirestoreDoc(run), { merge: true });
}

export async function firestoreAppendEvent(runId: string, event: AgentEvent): Promise<void> {
  await eventsCol(runId).doc(event.id).set(stripUndefined({ ...event }));
}

export async function firestoreGetRun(runId: string): Promise<InvestigationRun | undefined> {
  const snap = await runDocPath(runId).get();
  if (!snap.exists) return undefined;
  const eventsSnap = await eventsCol(runId).orderBy("at", "asc").get();
  const events = eventsSnap.docs.map((d) => d.data() as AgentEvent);
  return docToRun(snap.id, snap.data()!, events);
}

export async function firestoreListRuns(): Promise<InvestigationRun[]> {
  const snap = await getFirestore().collection(RUNS).orderBy("createdAt", "desc").limit(100).get();
  const runs: InvestigationRun[] = [];
  for (const doc of snap.docs) {
    const eventsSnap = await eventsCol(doc.id).orderBy("at", "asc").get();
    const events = eventsSnap.docs.map((d) => d.data() as AgentEvent);
    runs.push(docToRun(doc.id, doc.data(), events));
  }
  return runs;
}

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

/** Fleet registry document at `config/serviceRegistry`. */
export async function firestoreGetServiceRegistry(): Promise<ServiceRegistry | null> {
  const snap = await getFirestore().collection(CONFIG).doc(SERVICE_REGISTRY_DOC).get();
  if (!snap.exists) return null;
  const data = snap.data() as ServiceRegistry;
  if (!data?.services || !Array.isArray(data.services)) return null;
  return data;
}

export async function firestoreSaveServiceRegistry(registry: ServiceRegistry): Promise<void> {
  await getFirestore()
    .collection(CONFIG)
    .doc(SERVICE_REGISTRY_DOC)
    .set(stripUndefined({ ...registry, updatedAt: registry.updatedAt ?? nowIso() }), { merge: true });
}
