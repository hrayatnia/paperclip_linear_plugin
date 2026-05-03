import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../../manifest.js";
import { setMapping, type IssueMapping } from "../../state/index.js";

interface FakeLinearClient {
  issue: ReturnType<typeof vi.fn>;
  workflowStates: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
  createComment: ReturnType<typeof vi.fn>;
}

let currentClient: FakeLinearClient;

vi.mock("../../linear/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../linear/index.js")>();
  return {
    ...actual,
    createLinearClient: vi.fn(() => currentClient),
  };
});

const { registerPushHandlers } = await import("../push.js");

const PAPERCLIP_ISSUE_ID = "pc-issue-1";
const LINEAR_ID = "linear-issue-1";
const TEAM_ID = "team-uuid";
const STATE_ID = "state-uuid";

function makeFakeClient(overrides: Partial<FakeLinearClient> = {}): FakeLinearClient {
  return {
    issue: vi.fn().mockResolvedValue({ teamId: TEAM_ID }),
    workflowStates: vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: STATE_ID, name: "In Progress" }] }),
    updateIssue: vi.fn().mockResolvedValue({}),
    createComment: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeMapping(overrides: Partial<IssueMapping> = {}): IssueMapping {
  return {
    linearId: LINEAR_ID,
    linearIdentifier: "ENG-1",
    paperclipIssueId: PAPERCLIP_ISSUE_ID,
    lastSyncedHash: "hash-0",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function makeHarness(): Promise<TestHarness> {
  const harness = createTestHarness({
    manifest,
    config: {
      linear: { teamKey: "ENG" },
      paperclip: {
        companyId: "company-1",
        defaultProjectId: "proj",
        defaultAgentId: "agent",
      },
    },
  });
  await setMapping(harness.ctx, makeMapping());
  registerPushHandlers(harness.ctx);
  return harness;
}

function getSeenKey(harness: TestHarness, eventId: string): unknown {
  return harness.getState({
    scopeKind: "instance",
    stateKey: `linear-push-seen:${eventId}`,
  });
}

beforeEach(() => {
  currentClient = makeFakeClient();
});

describe("push pipeline integration — real state + real handlers + fake LinearClient", () => {
  it("translates issue.updated status into updateIssue with the resolved stateId", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.updated",
      { status: "in_progress" },
      { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-status-1" },
    );

    expect(currentClient.issue).toHaveBeenCalledWith(LINEAR_ID);
    const wsArgs = currentClient.workflowStates.mock.calls[0]?.[0] as {
      filter: { team: { id: { eq: string } }; name: { eq: string } };
      first: number;
    };
    expect(wsArgs.filter.team.id.eq).toBe(TEAM_ID);
    expect(wsArgs.filter.name.eq).toBe("In Progress");
    expect(wsArgs.first).toBe(1);
    expect(currentClient.updateIssue).toHaveBeenCalledWith(LINEAR_ID, { stateId: STATE_ID });
    expect(currentClient.createComment).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-status-1")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("forwards an issue.comment.created body via createComment", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "hello world" },
      {
        entityId: "comment-1",
        eventId: "evt-comment-1",
        actorType: "user",
        actorId: "user-123",
      },
    );

    expect(currentClient.createComment).toHaveBeenCalledTimes(1);
    expect(currentClient.createComment).toHaveBeenCalledWith({
      issueId: LINEAR_ID,
      body: "hello world",
    });
    expect(currentClient.updateIssue).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-comment-1")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("processes a status update and a comment for the same paperclip issue", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.updated",
      { status: "in_progress" },
      { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-combined-status" },
    );
    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "ship it" },
      {
        entityId: "comment-combined",
        eventId: "evt-combined-comment",
        actorType: "user",
        actorId: "user-1",
      },
    );

    expect(currentClient.updateIssue).toHaveBeenCalledWith(LINEAR_ID, { stateId: STATE_ID });
    expect(currentClient.createComment).toHaveBeenCalledWith({
      issueId: LINEAR_ID,
      body: "ship it",
    });
    expect(getSeenKey(harness, "evt-combined-status")).toBe(true);
    expect(getSeenKey(harness, "evt-combined-comment")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("makes no Linear calls when the paperclip issue has no mapping", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.updated",
      { status: "in_progress" },
      { entityId: "unmapped-issue", eventId: "evt-unmapped" },
    );

    expect(currentClient.issue).not.toHaveBeenCalled();
    expect(currentClient.workflowStates).not.toHaveBeenCalled();
    expect(currentClient.updateIssue).not.toHaveBeenCalled();
    expect(currentClient.createComment).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-unmapped")).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ignores comments authored by this plugin to prevent feedback loops", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "echo from earlier push" },
      {
        entityId: "comment-loop",
        eventId: "evt-loop",
        actorType: "plugin",
        actorId: manifest.id,
      },
    );

    expect(currentClient.createComment).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-loop")).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("dedupes the same issue.updated eventId across emissions", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");
    const base = { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-dedupe" };

    await harness.emit("issue.updated", { status: "done" }, base);
    await harness.emit("issue.updated", { status: "done" }, base);

    expect(currentClient.updateIssue).toHaveBeenCalledTimes(1);
    expect(getSeenKey(harness, "evt-dedupe")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("marks unknown statuses as seen without calling Linear", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.updated",
      { status: "weird-state" },
      { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-unknown-status" },
    );

    expect(currentClient.issue).not.toHaveBeenCalled();
    expect(currentClient.workflowStates).not.toHaveBeenCalled();
    expect(currentClient.updateIssue).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-unknown-status")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("marks empty comment bodies as seen without calling createComment", async () => {
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "" },
      {
        entityId: "comment-empty",
        eventId: "evt-empty-body",
        actorType: "user",
        actorId: "user-1",
      },
    );

    expect(currentClient.createComment).not.toHaveBeenCalled();
    expect(getSeenKey(harness, "evt-empty-body")).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a workflow-state lookup failure via ctx.logger.error and does not mark seen", async () => {
    currentClient = makeFakeClient({
      workflowStates: vi.fn().mockResolvedValue({ nodes: [] }),
    });
    const harness = await makeHarness();
    const errorSpy = vi.spyOn(harness.ctx.logger, "error");

    await expect(
      harness.emit(
        "issue.updated",
        { status: "in_progress" },
        { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-state-missing" },
      ),
    ).rejects.toThrow(/workflow state not found/i);

    expect(currentClient.updateIssue).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, meta] = errorSpy.mock.calls[0] ?? [];
    expect(message).toMatch(/linear push \(issue.updated\) failed/);
    expect(meta).toMatchObject({
      eventId: "evt-state-missing",
      paperclipIssueId: PAPERCLIP_ISSUE_ID,
      linearId: LINEAR_ID,
    });
    expect(getSeenKey(harness, "evt-state-missing")).toBeUndefined();
  });
});
