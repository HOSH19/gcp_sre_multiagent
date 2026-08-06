import { Storage } from "@google-cloud/storage";
import { config } from "../config.js";

let client: Storage | null = null;

function getStorage(): Storage {
  if (!client) {
    client = new Storage({ projectId: config.projectId });
  }
  return client;
}

function artifactsBucketName(): string {
  return config.artifactsBucket;
}

function runArtifactGsUri(runId: string, objectName: string): string {
  return `gs://${artifactsBucketName()}/runs/${runId}/${objectName}`;
}

/** Upload a JSON artifact under gs://{bucket}/runs/{runId}/{objectName}. */
async function uploadRunJsonArtifact(
  runId: string,
  objectName: string,
  data: unknown,
): Promise<string> {
  const bucket = getStorage().bucket(artifactsBucketName());
  const file = bucket.file(`runs/${runId}/${objectName}`);
  const body = JSON.stringify(data, null, 2);
  await file.save(body, {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-cache",
      metadata: { runId },
    },
  });
  return runArtifactGsUri(runId, objectName);
}

/** Upload finalized IncidentReport JSON; returns gs:// URI. */
export async function uploadReportArtifact(runId: string, report: unknown): Promise<string> {
  return uploadRunJsonArtifact(runId, "report.json", report);
}

/** Optional evidence dump alongside the report. */
export async function uploadEvidenceArtifact(runId: string, evidence: unknown): Promise<string> {
  return uploadRunJsonArtifact(runId, "evidence.json", evidence);
}
