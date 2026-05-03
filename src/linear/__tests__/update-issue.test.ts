import { describe, expect, it, vi } from "vitest";

import { commentOnLinearIssue, updateLinearIssue } from "../update-issue.js";

interface MockClientOpts {
  teamId?: string;
  stateNodes?: Array<{ id: string; name: string }>;
}

function makeClient(opts: MockClientOpts = {}) {
  const teamId = opts.teamId ?? "team-1";
  const stateNodes = opts.stateNodes ?? [{ id: "state-done", name: "Done" }];

  const issue = vi.fn(async (_id: string) => ({ teamId }));
  const workflowStates = vi.fn(async (_args: unknown) => ({ nodes: stateNodes }));
  const updateIssue = vi.fn(async (_id: string, _input: unknown) => ({ success: true }));
  const createComment = vi.fn(async (_input: unknown) => ({ success: true }));

  return { issue, workflowStates, updateIssue, createComment };
}

describe("updateLinearIssue", () => {
  it("looks up the workflow state by team id + name and calls updateIssue with the resolved stateId", async () => {
    const client = makeClient({
      teamId: "team-eng",
      stateNodes: [{ id: "state-done", name: "Done" }],
    });

    await updateLinearIssue(client as never, "issue-1", { stateName: "Done" });

    expect(client.issue).toHaveBeenCalledWith("issue-1");
    const filter = (client.workflowStates.mock.calls[0]?.[0] as { filter: unknown }).filter;
    expect(filter).toEqual({
      team: { id: { eq: "team-eng" } },
      name: { eq: "Done" },
    });
    expect(client.updateIssue).toHaveBeenCalledWith("issue-1", { stateId: "state-done" });
    expect(client.createComment).not.toHaveBeenCalled();
  });

  it("throws when no workflow state matches the requested name", async () => {
    const client = makeClient({ stateNodes: [] });
    await expect(
      updateLinearIssue(client as never, "issue-1", { stateName: "Mystery" }),
    ).rejects.toThrow(/workflow state not found/i);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });

  it("routes a comment-only patch to createComment and skips updateIssue", async () => {
    const client = makeClient();
    await updateLinearIssue(client as never, "issue-2", { comment: "looks good" });

    expect(client.createComment).toHaveBeenCalledWith({
      issueId: "issue-2",
      body: "looks good",
    });
    expect(client.updateIssue).not.toHaveBeenCalled();
    expect(client.workflowStates).not.toHaveBeenCalled();
  });

  it("applies both stateName and comment in a single call", async () => {
    const client = makeClient({
      stateNodes: [{ id: "state-review", name: "In Review" }],
    });

    await updateLinearIssue(client as never, "issue-3", {
      stateName: "In Review",
      comment: "ready for review",
    });

    expect(client.updateIssue).toHaveBeenCalledWith("issue-3", { stateId: "state-review" });
    expect(client.createComment).toHaveBeenCalledWith({
      issueId: "issue-3",
      body: "ready for review",
    });
  });

  it("is a no-op when patch has neither stateName nor comment", async () => {
    const client = makeClient();
    await updateLinearIssue(client as never, "issue-4", {});
    expect(client.updateIssue).not.toHaveBeenCalled();
    expect(client.createComment).not.toHaveBeenCalled();
    expect(client.workflowStates).not.toHaveBeenCalled();
  });
});

describe("commentOnLinearIssue", () => {
  it("delegates directly to client.createComment", async () => {
    const client = makeClient();
    await commentOnLinearIssue(client as never, "issue-5", "hello");
    expect(client.createComment).toHaveBeenCalledWith({
      issueId: "issue-5",
      body: "hello",
    });
  });
});
