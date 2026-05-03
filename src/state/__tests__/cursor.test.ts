import { describe, expect, it } from "vitest";

import { createTestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../../manifest.js";
import { getLastSyncedCursor, setLastSyncedCursor } from "../cursor.js";

describe("state/cursor", () => {
  it("round-trips a cursor string", async () => {
    const harness = createTestHarness({ manifest });

    await setLastSyncedCursor(harness.ctx, "2026-05-03T10:00:00.000Z");

    expect(await getLastSyncedCursor(harness.ctx)).toBe("2026-05-03T10:00:00.000Z");
  });

  it("returns null when no cursor has ever been written", async () => {
    const harness = createTestHarness({ manifest });

    expect(await getLastSyncedCursor(harness.ctx)).toBeNull();
  });

  it("setLastSyncedCursor(null) clears the stored value", async () => {
    const harness = createTestHarness({ manifest });

    await setLastSyncedCursor(harness.ctx, "cursor-1");
    expect(await getLastSyncedCursor(harness.ctx)).toBe("cursor-1");

    await setLastSyncedCursor(harness.ctx, null);
    expect(await getLastSyncedCursor(harness.ctx)).toBeNull();
    expect(harness.getState({ scopeKind: "instance", stateKey: "linear-cursor" })).toBeUndefined();
  });
});
