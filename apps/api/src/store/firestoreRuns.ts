import type { DocumentData } from "@google-cloud/firestore";
import { nowIso, type AgentEvent, type InvestigationRun } from "@gcp-sre/shared";
import {
  eventsCol,
  getFirestore,
  RUNS,
  runDocPath,
  stripUndefined,
} from "./firestoreClient.js";

/** Persist run metadata without the inlined events array (events live in subcollection). */
function runToFirestoreDoc(run: InvestigationRun): DocumentData {
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
