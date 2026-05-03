import { describe, expect, it, vi } from "vitest";

import { fetchUpdatedIssues } from "../fetch-issues.js";

type MockClient = {
  issues: ReturnType<typeof vi.fn>;
};

interface MockIssueOpts {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number;
  url?: string;
  updatedAt?: string;
  state?: { name: string } | null;
  assignee?: { id: string; email: string } | null;
}

function makeIssue(opts: MockIssueOpts): unknown {
  const state = "state" in opts ? opts.state : { name: "Todo" };
  const assignee = "assignee" in opts ? opts.assignee : null;
  return {
    id: opts.id,
    identifier: opts.identifier,
    title: opts.title,
    description: opts.description ?? null,
    priority: opts.priority ?? 0,
    url: opts.url ?? `https://linear.app/x/${opts.identifier}`,
    updatedAt: new Date(opts.updatedAt ?? "2026-05-01T00:00:00.000Z"),
    state: Promise.resolve(state),
    assignee: Promise.resolve(assignee),
  };
}

function makeClient(pages: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }[]): MockClient {
  let call = 0;
  const issues = vi.fn(async () => {
    const page = pages[call++];
    if (!page) throw new Error("issues called more times than expected");
    return page;
  });
  return { issues };
}

describe("fetchUpdatedIssues", () => {
  it("passes the caller's issueFilter through verbatim when there is no teamKey or sinceCursor", async () => {
    const client = makeClient([
      { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    ]);
    await fetchUpdatedIssues(client as never, null, {
      issueFilter: { state: { type: { eq: "started" } } },
    });

    expect(client.issues).toHaveBeenCalledTimes(1);
    const call = client.issues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["filter"]).toEqual({ state: { type: { eq: "started" } } });
    expect(call["after"]).toBeUndefined();
    expect(call["first"]).toBe(50);
  });

  it("AND-merges teamKey and sinceCursor into the issueFilter", async () => {
    const client = makeClient([
      { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    ]);
    await fetchUpdatedIssues(client as never, "2026-04-01T00:00:00.000Z", {
      teamKey: "ENG",
      issueFilter: { state: { type: { eq: "started" } } },
    });

    const call = client.issues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["filter"]).toEqual({
      state: { type: { eq: "started" } },
      team: { key: { eq: "ENG" } },
      updatedAt: { gte: "2026-04-01T00:00:00.000Z" },
    });
  });

  it("does not pass a filter when no teamKey, sinceCursor, or issueFilter are set", async () => {
    const client = makeClient([
      { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    ]);
    await fetchUpdatedIssues(client as never, null);
    const call = client.issues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["filter"]).toBeUndefined();
  });

  it("paginates across two pages and returns the final endCursor", async () => {
    const issueA = makeIssue({
      id: "i-1",
      identifier: "ENG-1",
      title: "A",
      state: { name: "Todo" },
      assignee: { id: "u-1", email: "a@x.test" },
    });
    const issueB = makeIssue({
      id: "i-2",
      identifier: "ENG-2",
      title: "B",
      state: { name: "In Progress" },
    });
    const client = makeClient([
      { nodes: [issueA], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
      { nodes: [issueB], pageInfo: { hasNextPage: false, endCursor: "cursor-2" } },
    ]);

    const result = await fetchUpdatedIssues(client as never, null, { teamKey: "ENG" });

    expect(client.issues).toHaveBeenCalledTimes(2);
    const second = client.issues.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(second["after"]).toBe("cursor-1");
    expect(result.issues.map((i) => i.id)).toEqual(["i-1", "i-2"]);
    expect(result.nextCursor).toBe("cursor-2");
  });

  it("maps Linear Issue fields onto LinearIssueSnapshot, awaiting state and assignee promises", async () => {
    const issue = makeIssue({
      id: "i-9",
      identifier: "ENG-9",
      title: "Pay support",
      description: "details",
      priority: 2,
      url: "https://linear.app/eng/ENG-9",
      updatedAt: "2026-05-02T10:00:00.000Z",
      state: { name: "In Review" },
      assignee: { id: "u-7", email: "dev@x.test" },
    });
    const client = makeClient([
      { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: "c" } },
    ]);

    const result = await fetchUpdatedIssues(client as never, null);
    expect(result.issues[0]).toEqual({
      id: "i-9",
      identifier: "ENG-9",
      title: "Pay support",
      description: "details",
      stateName: "In Review",
      assigneeId: "u-7",
      assigneeEmail: "dev@x.test",
      priority: 2,
      url: "https://linear.app/eng/ENG-9",
      updatedAt: "2026-05-02T10:00:00.000Z",
    });
  });

  it("returns null assigneeId/Email and empty stateName when relations are missing", async () => {
    const issue = makeIssue({
      id: "i-x",
      identifier: "ENG-X",
      title: "no relations",
      state: null,
      assignee: null,
    });
    const client = makeClient([
      { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
    ]);
    const result = await fetchUpdatedIssues(client as never, null);
    const snap = result.issues[0]!;
    expect(snap.stateName).toBe("");
    expect(snap.assigneeId).toBeNull();
    expect(snap.assigneeEmail).toBeNull();
  });
});
