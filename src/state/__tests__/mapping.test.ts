import { describe, expect, it } from "vitest";

import { createTestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../../manifest.js";
import {
  findMappingByPaperclipIssueId,
  getMapping,
  setMapping,
  type IssueMapping,
} from "../mapping.js";

function makeMapping(overrides: Partial<IssueMapping> = {}): IssueMapping {
  return {
    linearId: "lin_abc123",
    linearIdentifier: "ENG-42",
    paperclipIssueId: "00000000-0000-0000-0000-000000000001",
    lastSyncedHash: "hash-v1",
    updatedAt: "2026-05-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("state/mapping", () => {
  it("round-trips a mapping by linearId", async () => {
    const harness = createTestHarness({ manifest });
    const mapping = makeMapping();

    await setMapping(harness.ctx, mapping);

    const fetched = await getMapping(harness.ctx, mapping.linearId);
    expect(fetched).toEqual(mapping);
  });

  it("findMappingByPaperclipIssueId returns the mapping written by setMapping", async () => {
    const harness = createTestHarness({ manifest });
    const mapping = makeMapping();

    await setMapping(harness.ctx, mapping);

    const fetched = await findMappingByPaperclipIssueId(harness.ctx, mapping.paperclipIssueId);
    expect(fetched).toEqual(mapping);
  });

  it("returns null for missing reads", async () => {
    const harness = createTestHarness({ manifest });

    expect(await getMapping(harness.ctx, "lin_missing")).toBeNull();
    expect(
      await findMappingByPaperclipIssueId(harness.ctx, "00000000-0000-0000-0000-000000000999"),
    ).toBeNull();
  });

  it("setMapping overwrites the same forward key on re-write", async () => {
    const harness = createTestHarness({ manifest });
    const original = makeMapping({ lastSyncedHash: "hash-v1" });
    const updated = makeMapping({ lastSyncedHash: "hash-v2", updatedAt: "2026-05-03T11:00:00.000Z" });

    await setMapping(harness.ctx, original);
    await setMapping(harness.ctx, updated);

    const fetched = await getMapping(harness.ctx, original.linearId);
    expect(fetched).toEqual(updated);
  });

  it("writes both forward and reverse keys to ctx.state", async () => {
    const harness = createTestHarness({ manifest });
    const mapping = makeMapping();

    await setMapping(harness.ctx, mapping);

    const forward = harness.getState({
      scopeKind: "instance",
      stateKey: `linear-mapping:${mapping.linearId}`,
    });
    const reverse = harness.getState({
      scopeKind: "instance",
      stateKey: `linear-mapping-by-paperclip:${mapping.paperclipIssueId}`,
    });

    expect(forward).toEqual(mapping);
    expect(reverse).toBe(mapping.linearId);
  });
});
