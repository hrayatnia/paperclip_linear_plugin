/**
 * STUB — replaced by the `feat/linear-adapter` worker (W1).
 *
 * This file exists so `src/sync/*` and `src/worker.ts` compile against a stable
 * surface while the real implementation lives on its own branch. Do not call
 * the stubs at runtime: `createLinearClient` throws, and the others no-op.
 */

import type { LinearIssuePatch, LinearIssueSnapshot, LinearSyncFilter } from "./types.js";

export type { LinearIssuePatch, LinearIssueSnapshot, LinearSyncFilter };

export interface LinearClient {
  readonly _stub: true;
}

export interface FetchUpdatedIssuesResult {
  issues: LinearIssueSnapshot[];
  nextCursor: string | null;
}

export function createLinearClient(_apiKey: string): LinearClient {
  throw new Error(
    "createLinearClient is a stub. Install the implementation from branch feat/linear-adapter.",
  );
}

export async function fetchUpdatedIssues(
  _client: LinearClient,
  _sinceCursor: string | null,
  _filter?: LinearSyncFilter,
): Promise<FetchUpdatedIssuesResult> {
  return { issues: [], nextCursor: null };
}

export async function updateLinearIssue(
  _client: LinearClient,
  _linearIssueId: string,
  _patch: LinearIssuePatch,
): Promise<void> {
  return;
}

export async function commentOnLinearIssue(
  _client: LinearClient,
  _linearIssueId: string,
  _body: string,
): Promise<void> {
  return;
}
