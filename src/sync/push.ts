/**
 * STUB — replaced by the `feat/sync-push` worker (W4).
 *
 * Real implementation: subscribe to issue.updated and issue.comment.created;
 * resolve a mapping (state.findMappingByPaperclipIssueId); when present, push
 * status / comment to Linear via the linear adapter.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";

export function registerPushHandlers(ctx: PluginContext): void {
  ctx.logger.info("registerPushHandlers: stub no-op (replaced by feat/sync-push)");
}
