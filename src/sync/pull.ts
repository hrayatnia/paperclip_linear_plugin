/**
 * STUB — replaced by the `feat/sync-pull` worker (W3).
 *
 * Real implementation:
 *   1. Read config + secrets from ctx.
 *   2. Read last cursor via state.getLastSyncedCursor.
 *   3. fetchUpdatedIssues(client, cursor, filter).
 *   4. For each Linear issue: getMapping -> ctx.issues.create or ctx.issues.update.
 *   5. setMapping + setLastSyncedCursor on success.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";

export interface LinearSyncResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function runLinearSync(ctx: PluginContext): Promise<LinearSyncResult> {
  ctx.logger.info("runLinearSync: stub no-op (replaced by feat/sync-pull)");
  return { created: 0, updated: 0, skipped: 0 };
}
