/**
 * Snapshot of the Linear issue fields we mirror into Paperclip.
 * Kept narrow on purpose so the wire shape doesn't drift with @linear/sdk's full type.
 */
export interface LinearIssueSnapshot {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  stateName: string;
  assigneeId: string | null;
  assigneeEmail: string | null;
  priority: number;
  url: string;
  updatedAt: string;
}

export interface LinearSyncFilter {
  teamKey?: string;
  issueFilter?: Record<string, unknown>;
}

export interface LinearIssuePatch {
  stateName?: string;
  comment?: string;
}
