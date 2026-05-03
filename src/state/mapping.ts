import type { PluginContext, ScopeKey } from "@paperclipai/plugin-sdk";

export interface IssueMapping {
  linearId: string;
  linearIdentifier: string;
  paperclipIssueId: string;
  lastSyncedHash: string;
  updatedAt: string;
}

function forwardKey(linearId: string): ScopeKey {
  return { scopeKind: "instance", stateKey: `linear-mapping:${linearId}` };
}

function reverseKey(paperclipIssueId: string): ScopeKey {
  return {
    scopeKind: "instance",
    stateKey: `linear-mapping-by-paperclip:${paperclipIssueId}`,
  };
}

export async function getMapping(
  ctx: PluginContext,
  linearId: string,
): Promise<IssueMapping | null> {
  const raw = await ctx.state.get(forwardKey(linearId));
  if (raw == null) return null;
  return raw as IssueMapping;
}

export async function setMapping(ctx: PluginContext, mapping: IssueMapping): Promise<void> {
  await Promise.all([
    ctx.state.set(forwardKey(mapping.linearId), mapping),
    ctx.state.set(reverseKey(mapping.paperclipIssueId), mapping.linearId),
  ]);
}

export async function findMappingByPaperclipIssueId(
  ctx: PluginContext,
  paperclipIssueId: string,
): Promise<IssueMapping | null> {
  const linearId = await ctx.state.get(reverseKey(paperclipIssueId));
  if (typeof linearId !== "string" || linearId.length === 0) return null;
  return getMapping(ctx, linearId);
}
