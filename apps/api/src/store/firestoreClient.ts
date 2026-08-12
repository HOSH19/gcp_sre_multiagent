import { Firestore } from "@google-cloud/firestore";
import { config } from "../config.js";

export const RUNS = "runs";
export const EVENTS = "events";
export const LOCKS = "locks";
export const CONFIG = "config";
export const SERVICE_REGISTRY_DOC = "serviceRegistry";

export const INVESTIGATION_LOCK_SCOPE = "investigations";

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

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function runDocPath(runId: string) {
  return getFirestore().collection(RUNS).doc(runId);
}

export function eventsCol(runId: string) {
  return runDocPath(runId).collection(EVENTS);
}

export function lockDocPath(scope: string) {
  return getFirestore().collection(LOCKS).doc(scope);
}
