import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import manifest from "../../manifest.js";
import type { LinearIssueSnapshot } from "../../linear/index.js";
import type { IssueMapping } from "../../state/index.js";
import { hashLinearSnapshot } from "../mapping.js";

const fetchUpdatedIssuesMock = vi.fn();
const createLinearClientMock = vi.fn();

vi.mock("../../linear/index.js", () => ({
  createLinearClient: (apiKey: string) => createLinearClientMock(apiKey),
  fetchUpdatedIssues: (
    client: unknown,
    cursor: string | null,
    filter: unknown,
  ): Promise<{ issues: LinearIssueSnapshot[]; nextCursor: string | null }> =>
    fetchUpdatedIssuesMock(client, cursor, filter),
}));

const mappings = new Map<string, IssueMapping>();
let lastCursor: string | null = null;

vi.mock("../../state/index.js", () => ({
  getMapping: async (_ctx: unknown, linearId: string): Promise<IssueMapping | null> =>
    mappings.get(linearId) ?? null,
  setMapping: async (_ctx: unknown, mapping: IssueMapping): Promise<void> => {
    mappings.set(mapping.linearId, mapping);
  },
  getLastSyncedCursor: async (): Promise<string | null> => lastCursor,
  setLastSyncedCursor: async (_ctx: unknown, cursor: string | null): Promise<void> => {
    lastCursor = cursor;
  },
  findMappingByPaperclipIssueId: async (): Promise<IssueMapping | null> => null,
}));

const { runLinearSync } = await import("../pull.js");

const COMPANY_ID = "company-uuid-123";
const PROJECT_ID = "project-uuid-abc";
const AGENT_ID = "agent-uuid-xyz";

const baseConfig = {
  syncEnabled: true,
  linear: { teamKey: "ENG" },
  paperclip: {
    companyId: COMPANY_ID,
    defaultProjectId: PROJECT_ID,
    defaultAgentId: AGENT_ID,
  },
};

function buildSnapshot(overrides: Partial<LinearIssueSnapshot> = {}): LinearIssueSnapshot {
  return {
    id: "lin-id-default",
    identifier: "ENG-1",
    title: "Default title",
    description: "Default description",
    stateName: "Todo",
    assigneeId: null,
    assigneeEmail: null,
    priority: 3,
    url: "https://linear.app/team/issue/ENG-1",
    updatedAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("runLinearSync", () => {
  let harness: TestHarness;

  beforeEach(() => {
    mappings.clear();
    lastCursor = null;
    fetchUpdatedIssuesMock.mockReset();
    createLinearClientMock.mockReset();
    createLinearClientMock.mockReturnValue({ _stub: true });
    harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities],
      config: baseConfig,
    });
  });

  it("returns zeros and short-circuits when syncEnabled is false", async () => {
    harness.setConfig({ ...baseConfig, syncEnabled: false });
    const result = await runLinearSync(harness.ctx);
    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(fetchUpdatedIssuesMock).not.toHaveBeenCalled();
  });

  it("creates, updates, and skips issues correctly and advances the cursor", async () => {
    const newIssue = buildSnapshot({
      id: "lin-new",
      identifier: "ENG-10",
      title: "Brand new issue",
      description: "A new bug",
      stateName: "Todo",
      priority: 2,
      updatedAt: "2026-05-02T08:00:00.000Z",
      url: "https://linear.app/team/issue/ENG-10",
    });

    const changedIssue = buildSnapshot({
      id: "lin-changed",
      identifier: "ENG-11",
      title: "Updated title",
      description: "Updated description",
      stateName: "In Progress",
      priority: 1,
      updatedAt: "2026-05-02T09:30:00.000Z",
      url: "https://linear.app/team/issue/ENG-11",
    });

    const unchangedIssue = buildSnapshot({
      id: "lin-unchanged",
      identifier: "ENG-12",
      title: "Stable",
      description: "No changes",
      stateName: "Todo",
      priority: 3,
      updatedAt: "2026-05-02T07:15:00.000Z",
      url: "https://linear.app/team/issue/ENG-12",
    });

    const previousChangedHash = hashLinearSnapshot(
      buildSnapshot({
        id: "lin-changed",
        identifier: "ENG-11",
        title: "Old title",
        description: "Old description",
        stateName: "Todo",
        priority: 3,
        updatedAt: "2026-04-30T00:00:00.000Z",
        url: "https://linear.app/team/issue/ENG-11",
      }),
    );

    mappings.set("lin-changed", {
      linearId: "lin-changed",
      linearIdentifier: "ENG-11",
      paperclipIssueId: "pc-issue-changed",
      lastSyncedHash: previousChangedHash,
      updatedAt: "2026-04-30T00:00:00.000Z",
    });

    mappings.set("lin-unchanged", {
      linearId: "lin-unchanged",
      linearIdentifier: "ENG-12",
      paperclipIssueId: "pc-issue-unchanged",
      lastSyncedHash: hashLinearSnapshot(unchangedIssue),
      updatedAt: "2026-04-30T00:00:00.000Z",
    });

    harness.seed({
      issues: [
        {
          id: "pc-issue-changed",
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          projectWorkspaceId: null,
          goalId: null,
          parentId: null,
          title: "Old title",
          description: "Old description",
          status: "todo",
          priority: "medium",
          assigneeAgentId: AGENT_ID,
          assigneeUserId: null,
          checkoutRunId: null,
          executionRunId: null,
          executionAgentNameKey: null,
          executionLockedAt: null,
          createdByAgentId: null,
          createdByUserId: null,
          issueNumber: null,
          identifier: null,
          originKind: `plugin:${manifest.id}`,
          originId: null,
          originRunId: null,
          requestDepth: 0,
          billingCode: null,
          assigneeAdapterOverrides: null,
          executionWorkspaceId: null,
          executionWorkspacePreference: null,
          executionWorkspaceSettings: null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          hiddenAt: null,
          createdAt: new Date("2026-04-30T00:00:00.000Z"),
          updatedAt: new Date("2026-04-30T00:00:00.000Z"),
        },
      ],
    });

    fetchUpdatedIssuesMock.mockResolvedValue({
      issues: [newIssue, changedIssue, unchangedIssue],
      nextCursor: null,
    });

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 1, updated: 1, skipped: 1 });

    expect(createLinearClientMock).toHaveBeenCalledWith("resolved:linear.apiKey");
    expect(fetchUpdatedIssuesMock).toHaveBeenCalledTimes(1);
    expect(fetchUpdatedIssuesMock.mock.calls[0]?.[1]).toBeNull();
    expect(fetchUpdatedIssuesMock.mock.calls[0]?.[2]).toEqual({ teamKey: "ENG" });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const createArg = createSpy.mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      assigneeAgentId: AGENT_ID,
      title: "Brand new issue",
      status: "todo",
      priority: "high",
    });
    expect(createArg?.description).toContain("ENG-10");
    expect(createArg?.description).toContain("https://linear.app/team/issue/ENG-10");

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [updatedIssueId, patch, updateCompanyId] = updateSpy.mock.calls[0] ?? [];
    expect(updatedIssueId).toBe("pc-issue-changed");
    expect(updateCompanyId).toBe(COMPANY_ID);
    expect(patch).toMatchObject({
      title: "Updated title",
      status: "in_progress",
    });

    expect(mappings.get("lin-new")?.lastSyncedHash).toBe(hashLinearSnapshot(newIssue));
    expect(mappings.get("lin-changed")?.lastSyncedHash).toBe(hashLinearSnapshot(changedIssue));
    expect(mappings.get("lin-unchanged")?.lastSyncedHash).toBe(hashLinearSnapshot(unchangedIssue));

    expect(lastCursor).toBe(changedIssue.updatedAt);
  });

  it("does not advance the cursor when there are no issues to process", async () => {
    fetchUpdatedIssuesMock.mockResolvedValue({ issues: [], nextCursor: null });
    const result = await runLinearSync(harness.ctx);
    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(lastCursor).toBeNull();
  });
});
