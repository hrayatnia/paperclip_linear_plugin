import type { LinearClient } from "@linear/sdk";

import type { LinearIssuePatch } from "./types.js";

export async function updateLinearIssue(
  client: LinearClient,
  linearIssueId: string,
  patch: LinearIssuePatch,
): Promise<void> {
  if (patch.stateName) {
    const stateId = await resolveStateId(client, linearIssueId, patch.stateName);
    await client.updateIssue(linearIssueId, { stateId });
  }
  if (patch.comment) {
    await commentOnLinearIssue(client, linearIssueId, patch.comment);
  }
}

export async function commentOnLinearIssue(
  client: LinearClient,
  linearIssueId: string,
  body: string,
): Promise<void> {
  await client.createComment({ issueId: linearIssueId, body });
}

async function resolveStateId(
  client: LinearClient,
  linearIssueId: string,
  stateName: string,
): Promise<string> {
  const teamId = await resolveTeamId(client, linearIssueId);
  const states = await client.workflowStates({
    filter: {
      team: { id: { eq: teamId } },
      name: { eq: stateName },
    },
    first: 1,
  });
  const node = states.nodes?.[0];
  if (!node) {
    throw new Error(
      `Linear workflow state not found: name="${stateName}" teamId="${teamId}"`,
    );
  }
  return node.id;
}

async function resolveTeamId(client: LinearClient, linearIssueId: string): Promise<string> {
  const issue = await client.issue(linearIssueId);
  if (!issue.teamId) {
    throw new Error(`Linear issue ${linearIssueId} has no team`);
  }
  return issue.teamId;
}
