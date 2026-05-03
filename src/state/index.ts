/**
 * STUB — replaced by the `feat/state-mapping` worker (W2).
 *
 * Real implementation will use ctx.state with instance scope, keys
 * `linear-mapping:<linearId>` and `linear-cursor`. The shapes below are the
 * stable contract the rest of the plugin compiles against.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";

export interface IssueMapping {
  linearId: string;
  linearIdentifier: string;
  paperclipIssueId: string;
  lastSyncedHash: string;
  updatedAt: string;
}

export async function getMapping(
  _ctx: PluginContext,
  _linearId: string,
): Promise<IssueMapping | null> {
  return null;
}

export async function setMapping(_ctx: PluginContext, _mapping: IssueMapping): Promise<void> {
  return;
}

export async function findMappingByPaperclipIssueId(
  _ctx: PluginContext,
  _paperclipIssueId: string,
): Promise<IssueMapping | null> {
  return null;
}

export async function getLastSyncedCursor(_ctx: PluginContext): Promise<string | null> {
  return null;
}

export async function setLastSyncedCursor(
  _ctx: PluginContext,
  _cursor: string | null,
): Promise<void> {
  return;
}
