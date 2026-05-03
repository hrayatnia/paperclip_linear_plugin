export type { LinearClient } from "@linear/sdk";

export { createLinearClient } from "./client.js";
export { fetchUpdatedIssues } from "./fetch-issues.js";
export type { FetchUpdatedIssuesResult } from "./fetch-issues.js";
export { commentOnLinearIssue, updateLinearIssue } from "./update-issue.js";
export type { LinearIssuePatch, LinearIssueSnapshot, LinearSyncFilter } from "./types.js";
