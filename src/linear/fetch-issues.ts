import type { Issue, LinearClient } from "@linear/sdk";

import type { LinearIssueSnapshot, LinearSyncFilter } from "./types.js";

export interface FetchUpdatedIssuesResult {
  issues: LinearIssueSnapshot[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export async function fetchUpdatedIssues(
  client: LinearClient,
  sinceCursor: string | null,
  filter?: LinearSyncFilter,
): Promise<FetchUpdatedIssuesResult> {
  const baseFilter = buildIssueFilter(sinceCursor, filter);

  const snapshots: LinearIssueSnapshot[] = [];
  let after: string | undefined;
  let lastEndCursor: string | null = null;

  while (true) {
    const queryArgs: Record<string, unknown> = { first: PAGE_SIZE };
    if (baseFilter !== undefined) queryArgs["filter"] = baseFilter;
    if (after !== undefined) queryArgs["after"] = after;

    const page = await client.issues(queryArgs);
    const pageSnapshots = await Promise.all((page.nodes as Issue[]).map(snapshotIssue));
    snapshots.push(...pageSnapshots);

    const { endCursor, hasNextPage } = page.pageInfo;
    if (endCursor) lastEndCursor = endCursor;
    if (!hasNextPage || !endCursor) break;
    after = endCursor;
  }

  return { issues: snapshots, nextCursor: lastEndCursor };
}

function buildIssueFilter(
  sinceCursor: string | null,
  filter?: LinearSyncFilter,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  if (filter?.issueFilter) Object.assign(merged, filter.issueFilter);
  if (filter?.teamKey) merged["team"] = { key: { eq: filter.teamKey } };
  if (sinceCursor) {
    const iso = toIsoTimestamp(sinceCursor);
    merged["updatedAt"] = { gte: iso };
  }
  return Object.keys(merged).length === 0 ? undefined : merged;
}

function toIsoTimestamp(cursor: string): string {
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return cursor;
  return parsed.toISOString();
}

async function snapshotIssue(issue: Issue): Promise<LinearIssueSnapshot> {
  const [state, assignee] = await Promise.all([issue.state, issue.assignee]);
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    stateName: state?.name ?? "",
    assigneeId: assignee?.id ?? null,
    assigneeEmail: assignee?.email ?? null,
    priority: issue.priority,
    url: issue.url,
    updatedAt: new Date(issue.updatedAt).toISOString(),
  };
}
