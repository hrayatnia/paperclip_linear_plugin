import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import manifest from "../../manifest.js";
import type { LinearIssueSnapshot } from "../../linear/index.js";
import type { IssueMapping } from "../../state/index.js";
import { hashLinearSnapshot } from "../mapping.js";

interface FakeLinearIssueOpts {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number;
  url?: string;
  updatedAt: string;
  stateName?: string;
  assignee?: { id: string; email: string } | null;
}

interface FakePage {
  nodes: ReturnType<typeof makeFakeLinearIssue>[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

function makeFakeLinearIssue(opts: FakeLinearIssueOpts) {
  const stateName = opts.stateName ?? "Todo";
  const assignee = opts.assignee ?? null;
  return {
    id: opts.id,
    identifier: opts.identifier,
    title: opts.title,
    description: opts.description ?? null,
    priority: opts.priority ?? 0,
    url: opts.url ?? `https://linear.app/team/issue/${opts.identifier}`,
    updatedAt: new Date(opts.updatedAt),
    state: Promise.resolve({ name: stateName }),
    assignee: Promise.resolve(assignee),
    _stateName: stateName,
    _assignee: assignee,
  };
}

const issuesQueryMock = vi.fn();
const fakeLinearClient = { issues: issuesQueryMock } as const;
const createLinearClientMock = vi.fn(() => fakeLinearClient);

vi.mock("../../linear/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../linear/index.js")>();
  return { ...real, createLinearClient: createLinearClientMock };
});

const { runLinearSync } = await import("../pull.js");

const COMPANY_ID = "company-uuid-int-1";
const PROJECT_ID = "project-uuid-int-1";
const AGENT_ID = "agent-uuid-int-1";
const ORIGIN_KIND = `plugin:${manifest.id}`;

const baseConfig = {
  syncEnabled: true,
  linear: { teamKey: "ENG" },
  paperclip: {
    companyId: COMPANY_ID,
    defaultProjectId: PROJECT_ID,
    defaultAgentId: AGENT_ID,
  },
};

const FORWARD_KEY = (linearId: string) => ({
  scopeKind: "instance" as const,
  stateKey: `linear-mapping:${linearId}`,
});
const REVERSE_KEY = (paperclipIssueId: string) => ({
  scopeKind: "instance" as const,
  stateKey: `linear-mapping-by-paperclip:${paperclipIssueId}`,
});
const CURSOR_KEY = { scopeKind: "instance" as const, stateKey: "linear-cursor" };

function snapshotFromFake(issue: ReturnType<typeof makeFakeLinearIssue>): LinearIssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    stateName: issue._stateName,
    assigneeId: issue._assignee?.id ?? null,
    assigneeEmail: issue._assignee?.email ?? null,
    priority: issue.priority,
    url: issue.url,
    updatedAt: issue.updatedAt.toISOString(),
  };
}

async function seedMapping(harness: TestHarness, mapping: IssueMapping) {
  await harness.ctx.state.set(FORWARD_KEY(mapping.linearId), mapping);
  await harness.ctx.state.set(REVERSE_KEY(mapping.paperclipIssueId), mapping.linearId);
}

function seedExistingIssue(harness: TestHarness, paperclipIssueId: string, title: string) {
  const ts = new Date("2026-04-30T00:00:00.000Z");
  harness.seed({
    issues: [
      {
        id: paperclipIssueId,
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        projectWorkspaceId: null,
        goalId: null,
        parentId: null,
        title,
        description: null,
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
        originKind: ORIGIN_KIND,
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
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  });
}

describe("runLinearSync (integration)", () => {
  let harness: TestHarness;

  beforeEach(() => {
    issuesQueryMock.mockReset();
    createLinearClientMock.mockClear();
    harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities],
      config: baseConfig,
    });
  });

  it("cold start: creates Paperclip issues for every Linear issue and persists mappings + cursor", async () => {
    const issueA = makeFakeLinearIssue({
      id: "lin-a",
      identifier: "ENG-101",
      title: "First",
      description: "first body",
      priority: 2,
      updatedAt: "2026-05-01T08:00:00.000Z",
    });
    const issueB = makeFakeLinearIssue({
      id: "lin-b",
      identifier: "ENG-102",
      title: "Second",
      priority: 3,
      updatedAt: "2026-05-01T10:00:00.000Z",
    });
    const issueC = makeFakeLinearIssue({
      id: "lin-c",
      identifier: "ENG-103",
      title: "Third",
      priority: 1,
      updatedAt: "2026-05-01T09:30:00.000Z",
    });

    const page: FakePage = {
      nodes: [issueA, issueB, issueC],
      pageInfo: { hasNextPage: false, endCursor: "cursor-end" },
    };
    issuesQueryMock.mockResolvedValueOnce(page);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 3, updated: 0, skipped: 0 });
    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(updateSpy).not.toHaveBeenCalled();

    for (const call of createSpy.mock.calls) {
      const arg = call[0];
      expect(arg.companyId).toBe(COMPANY_ID);
      expect(arg.projectId).toBe(PROJECT_ID);
      expect(arg.assigneeAgentId).toBe(AGENT_ID);
    }

    for (const fake of [issueA, issueB, issueC]) {
      const forward = harness.getState(FORWARD_KEY(fake.id)) as IssueMapping | undefined;
      expect(forward).toBeDefined();
      expect(forward!.lastSyncedHash).toBe(hashLinearSnapshot(snapshotFromFake(fake)));
      expect(harness.getState(REVERSE_KEY(forward!.paperclipIssueId))).toBe(fake.id);
    }

    expect(harness.getState(CURSOR_KEY)).toBe(issueB.updatedAt.toISOString());
    expect(createLinearClientMock).toHaveBeenCalledWith("resolved:linear.apiKey");
  });

  it("incremental: one create, one update, one skip; cursor advances to highest updatedAt", async () => {
    const newIssue = makeFakeLinearIssue({
      id: "lin-new",
      identifier: "ENG-201",
      title: "Newcomer",
      priority: 2,
      updatedAt: "2026-05-02T08:00:00.000Z",
    });
    const changedIssue = makeFakeLinearIssue({
      id: "lin-changed",
      identifier: "ENG-202",
      title: "Updated title",
      description: "Updated body",
      priority: 1,
      updatedAt: "2026-05-02T12:00:00.000Z",
    });
    const unchangedIssue = makeFakeLinearIssue({
      id: "lin-stable",
      identifier: "ENG-203",
      title: "Stable",
      priority: 3,
      updatedAt: "2026-05-02T07:30:00.000Z",
    });

    const oldChangedSnapshot: LinearIssueSnapshot = {
      ...snapshotFromFake(changedIssue),
      title: "Old title",
      description: null,
      priority: 3,
      updatedAt: "2026-04-30T00:00:00.000Z",
    };

    seedExistingIssue(harness, "pc-issue-changed", "Old title");

    await seedMapping(harness, {
      linearId: "lin-changed",
      linearIdentifier: "ENG-202",
      paperclipIssueId: "pc-issue-changed",
      lastSyncedHash: hashLinearSnapshot(oldChangedSnapshot),
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    await seedMapping(harness, {
      linearId: "lin-stable",
      linearIdentifier: "ENG-203",
      paperclipIssueId: "pc-issue-stable",
      lastSyncedHash: hashLinearSnapshot(snapshotFromFake(unchangedIssue)),
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    await harness.ctx.state.set(CURSOR_KEY, "2026-05-01T00:00:00.000Z");

    issuesQueryMock.mockResolvedValueOnce({
      nodes: [newIssue, changedIssue, unchangedIssue],
      pageInfo: { hasNextPage: false, endCursor: "cur-1" },
    } satisfies FakePage);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 1, updated: 1, skipped: 1 });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const createArg = createSpy.mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      assigneeAgentId: AGENT_ID,
      title: "Newcomer",
      status: "todo",
      priority: "high",
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [updateId, updatePatch, updateCompanyId] = updateSpy.mock.calls[0] ?? [];
    expect(updateId).toBe("pc-issue-changed");
    expect(updateCompanyId).toBe(COMPANY_ID);
    expect(updatePatch).toMatchObject({ title: "Updated title" });

    expect(harness.getState(CURSOR_KEY)).toBe(changedIssue.updatedAt.toISOString());

    const newForward = harness.getState(FORWARD_KEY("lin-new")) as IssueMapping | undefined;
    expect(newForward).toBeDefined();
    expect(harness.getState(REVERSE_KEY(newForward!.paperclipIssueId))).toBe("lin-new");
  });

  it("paginates across two pages; cursor lands on the highest updatedAt across both", async () => {
    const p1a = makeFakeLinearIssue({
      id: "p1a",
      identifier: "ENG-301",
      title: "p1a",
      updatedAt: "2026-05-03T08:00:00.000Z",
    });
    const p1b = makeFakeLinearIssue({
      id: "p1b",
      identifier: "ENG-302",
      title: "p1b",
      updatedAt: "2026-05-03T11:00:00.000Z",
    });
    const p2a = makeFakeLinearIssue({
      id: "p2a",
      identifier: "ENG-303",
      title: "p2a",
      updatedAt: "2026-05-03T09:00:00.000Z",
    });
    const p2b = makeFakeLinearIssue({
      id: "p2b",
      identifier: "ENG-304",
      title: "p2b",
      updatedAt: "2026-05-03T07:00:00.000Z",
    });

    issuesQueryMock
      .mockResolvedValueOnce({
        nodes: [p1a, p1b],
        pageInfo: { hasNextPage: true, endCursor: "page-1-end" },
      } satisfies FakePage)
      .mockResolvedValueOnce({
        nodes: [p2a, p2b],
        pageInfo: { hasNextPage: false, endCursor: "page-2-end" },
      } satisfies FakePage);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 4, updated: 0, skipped: 0 });
    expect(createSpy).toHaveBeenCalledTimes(4);
    expect(issuesQueryMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = issuesQueryMock.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(secondCallArgs["after"]).toBe("page-1-end");

    expect(harness.getState(CURSOR_KEY)).toBe(p1b.updatedAt.toISOString());
  });

  it("syncEnabled = false: never calls Linear, never creates or updates", async () => {
    harness.setConfig({ ...baseConfig, syncEnabled: false });

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(issuesQueryMock).not.toHaveBeenCalled();
    expect(createLinearClientMock).not.toHaveBeenCalled();
  });

  it("empty Linear result: nothing written, cursor unchanged", async () => {
    await harness.ctx.state.set(CURSOR_KEY, "2026-05-01T00:00:00.000Z");

    issuesQueryMock.mockResolvedValueOnce({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    } satisfies FakePage);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(harness.getState(CURSOR_KEY)).toBe("2026-05-01T00:00:00.000Z");
  });

  it("all unchanged: every fetched issue matches its mapping hash; no writes, cursor unchanged", async () => {
    const stableA = makeFakeLinearIssue({
      id: "lin-sa",
      identifier: "ENG-401",
      title: "stable a",
      updatedAt: "2026-05-04T08:00:00.000Z",
    });
    const stableB = makeFakeLinearIssue({
      id: "lin-sb",
      identifier: "ENG-402",
      title: "stable b",
      updatedAt: "2026-05-04T09:00:00.000Z",
    });

    await seedMapping(harness, {
      linearId: "lin-sa",
      linearIdentifier: "ENG-401",
      paperclipIssueId: "pc-sa",
      lastSyncedHash: hashLinearSnapshot(snapshotFromFake(stableA)),
      updatedAt: "2026-05-04T07:00:00.000Z",
    });
    await seedMapping(harness, {
      linearId: "lin-sb",
      linearIdentifier: "ENG-402",
      paperclipIssueId: "pc-sb",
      lastSyncedHash: hashLinearSnapshot(snapshotFromFake(stableB)),
      updatedAt: "2026-05-04T07:00:00.000Z",
    });
    const existingCursor = "2026-05-04T10:00:00.000Z";
    await harness.ctx.state.set(CURSOR_KEY, existingCursor);

    issuesQueryMock.mockResolvedValueOnce({
      nodes: [stableA, stableB],
      pageInfo: { hasNextPage: false, endCursor: "c" },
    } satisfies FakePage);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 2 });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(harness.getState(CURSOR_KEY)).toBe(existingCursor);
  });

  it("cursor monotonic: a fetched issue older than current cursor does not regress the cursor", async () => {
    const existingCursor = "2026-05-05T12:00:00.000Z";
    await harness.ctx.state.set(CURSOR_KEY, existingCursor);

    const oldIssue = makeFakeLinearIssue({
      id: "lin-old",
      identifier: "ENG-501",
      title: "Backfill",
      updatedAt: "2026-05-01T08:00:00.000Z",
    });

    issuesQueryMock.mockResolvedValueOnce({
      nodes: [oldIssue],
      pageInfo: { hasNextPage: false, endCursor: "c" },
    } satisfies FakePage);

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(harness.getState(CURSOR_KEY)).toBe(existingCursor);
  });

  it("hash-based change detection: same content skips, different title triggers update", async () => {
    const sameContent = makeFakeLinearIssue({
      id: "lin-same",
      identifier: "ENG-601",
      title: "unchanged",
      updatedAt: "2026-05-06T08:00:00.000Z",
    });
    const changedTitle = makeFakeLinearIssue({
      id: "lin-diff",
      identifier: "ENG-602",
      title: "new title",
      updatedAt: "2026-05-06T09:00:00.000Z",
    });

    seedExistingIssue(harness, "pc-diff", "old title");

    await seedMapping(harness, {
      linearId: "lin-same",
      linearIdentifier: "ENG-601",
      paperclipIssueId: "pc-same",
      lastSyncedHash: hashLinearSnapshot(snapshotFromFake(sameContent)),
      updatedAt: "2026-05-05T00:00:00.000Z",
    });

    const oldDiffSnapshot: LinearIssueSnapshot = {
      ...snapshotFromFake(changedTitle),
      title: "old title",
      updatedAt: "2026-05-05T00:00:00.000Z",
    };
    await seedMapping(harness, {
      linearId: "lin-diff",
      linearIdentifier: "ENG-602",
      paperclipIssueId: "pc-diff",
      lastSyncedHash: hashLinearSnapshot(oldDiffSnapshot),
      updatedAt: "2026-05-05T00:00:00.000Z",
    });

    issuesQueryMock.mockResolvedValueOnce({
      nodes: [sameContent, changedTitle],
      pageInfo: { hasNextPage: false, endCursor: "c" },
    } satisfies FakePage);

    const createSpy = vi.spyOn(harness.ctx.issues, "create");
    const updateSpy = vi.spyOn(harness.ctx.issues, "update");

    const result = await runLinearSync(harness.ctx);

    expect(result).toEqual({ created: 0, updated: 1, skipped: 1 });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [updateId, patch, updateCompanyId] = updateSpy.mock.calls[0] ?? [];
    expect(updateId).toBe("pc-diff");
    expect(updateCompanyId).toBe(COMPANY_ID);
    expect(patch).toMatchObject({ title: "new title" });

    const refreshedDiff = harness.getState(FORWARD_KEY("lin-diff")) as IssueMapping;
    expect(refreshedDiff.lastSyncedHash).toBe(hashLinearSnapshot(snapshotFromFake(changedTitle)));
  });
});
