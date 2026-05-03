import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../../manifest.js";
import type { IssueMapping } from "../../state/index.js";

vi.mock("../../linear/index.js", () => ({
  createLinearClient: vi.fn(() => ({ _stub: true })),
  updateLinearIssue: vi.fn(async () => undefined),
  commentOnLinearIssue: vi.fn(async () => undefined),
  fetchUpdatedIssues: vi.fn(async () => ({ issues: [], nextCursor: null })),
}));

const mappings = new Map<string, IssueMapping>();

vi.mock("../../state/index.js", () => ({
  findMappingByPaperclipIssueId: vi.fn(async (_ctx: unknown, paperclipIssueId: string) => {
    return mappings.get(paperclipIssueId) ?? null;
  }),
  getMapping: vi.fn(async () => null),
  setMapping: vi.fn(async () => undefined),
  getLastSyncedCursor: vi.fn(async () => null),
  setLastSyncedCursor: vi.fn(async () => undefined),
}));

const linearModule = await import("../../linear/index.js");
const { registerPushHandlers } = await import("../push.js");

const updateLinearIssue = vi.mocked(linearModule.updateLinearIssue);
const commentOnLinearIssue = vi.mocked(linearModule.commentOnLinearIssue);
const createLinearClient = vi.mocked(linearModule.createLinearClient);

const PAPERCLIP_ISSUE_ID = "pc-issue-1";
const LINEAR_ID = "linear-issue-1";

function seedMapping(): void {
  mappings.set(PAPERCLIP_ISSUE_ID, {
    linearId: LINEAR_ID,
    linearIdentifier: "ENG-1",
    paperclipIssueId: PAPERCLIP_ISSUE_ID,
    lastSyncedHash: "hash-0",
    updatedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
  });
}

function makeHarness(): TestHarness {
  const harness = createTestHarness({
    manifest,
    config: {
      linear: { teamKey: "ENG" },
      paperclip: { defaultProjectId: "proj", defaultAgentId: "agent" },
    },
  });
  registerPushHandlers(harness.ctx);
  return harness;
}

beforeEach(() => {
  mappings.clear();
  updateLinearIssue.mockClear();
  commentOnLinearIssue.mockClear();
  createLinearClient.mockClear();
});

describe("registerPushHandlers — issue.updated", () => {
  it("translates a paperclip status change into a Linear stateName patch", async () => {
    seedMapping();
    const harness = makeHarness();

    await harness.emit(
      "issue.updated",
      { status: "in_progress" },
      { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-1" },
    );

    expect(updateLinearIssue).toHaveBeenCalledTimes(1);
    expect(updateLinearIssue).toHaveBeenCalledWith(
      expect.anything(),
      LINEAR_ID,
      { stateName: "In Progress" },
    );
  });

  it("does nothing when the paperclip issue is not mapped to Linear", async () => {
    const harness = makeHarness();

    await harness.emit(
      "issue.updated",
      { status: "in_progress" },
      { entityId: "unmapped-issue", eventId: "evt-unmapped" },
    );

    expect(updateLinearIssue).not.toHaveBeenCalled();
  });

  it("dedupes by eventId so the same event only pushes once", async () => {
    seedMapping();
    const harness = makeHarness();

    const base = { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-dedupe" };
    await harness.emit("issue.updated", { status: "done" }, base);
    await harness.emit("issue.updated", { status: "done" }, base);

    expect(updateLinearIssue).toHaveBeenCalledTimes(1);
    expect(updateLinearIssue).toHaveBeenCalledWith(
      expect.anything(),
      LINEAR_ID,
      { stateName: "Done" },
    );
  });

  it("skips the Linear API when no mappable fields are in the payload", async () => {
    seedMapping();
    const harness = makeHarness();

    await harness.emit(
      "issue.updated",
      { title: "no status change" },
      { entityId: PAPERCLIP_ISSUE_ID, eventId: "evt-no-status" },
    );

    expect(updateLinearIssue).not.toHaveBeenCalled();
  });
});

describe("registerPushHandlers — issue.comment.created", () => {
  it("forwards a board user comment body to Linear", async () => {
    seedMapping();
    const harness = makeHarness();

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "hello from paperclip" },
      {
        entityId: "comment-1",
        eventId: "evt-comment-1",
        actorType: "user",
        actorId: "user-123",
      },
    );

    expect(commentOnLinearIssue).toHaveBeenCalledTimes(1);
    expect(commentOnLinearIssue).toHaveBeenCalledWith(
      expect.anything(),
      LINEAR_ID,
      "hello from paperclip",
    );
  });

  it("ignores comments authored by this plugin to avoid feedback loops", async () => {
    seedMapping();
    const harness = makeHarness();

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: PAPERCLIP_ISSUE_ID, body: "echo from previous push" },
      {
        entityId: "comment-2",
        eventId: "evt-comment-2",
        actorType: "plugin",
        actorId: manifest.id,
      },
    );

    expect(commentOnLinearIssue).not.toHaveBeenCalled();
  });

  it("ignores comments on issues that are not Linear-backed", async () => {
    const harness = makeHarness();

    await harness.emit(
      "issue.comment.created",
      { parentEntityId: "unmapped-issue", body: "nope" },
      {
        entityId: "comment-3",
        eventId: "evt-comment-3",
        actorType: "user",
        actorId: "user-1",
      },
    );

    expect(commentOnLinearIssue).not.toHaveBeenCalled();
  });

  it("dedupes comments by eventId", async () => {
    seedMapping();
    const harness = makeHarness();

    const base = {
      entityId: "comment-4",
      eventId: "evt-comment-dedupe",
      actorType: "user" as const,
      actorId: "user-1",
    };
    const payload = { parentEntityId: PAPERCLIP_ISSUE_ID, body: "once" };
    await harness.emit("issue.comment.created", payload, base);
    await harness.emit("issue.comment.created", payload, base);

    expect(commentOnLinearIssue).toHaveBeenCalledTimes(1);
  });
});
