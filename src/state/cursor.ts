import type { PluginContext, ScopeKey } from "@paperclipai/plugin-sdk";

const CURSOR_KEY: ScopeKey = { scopeKind: "instance", stateKey: "linear-cursor" };

export async function getLastSyncedCursor(ctx: PluginContext): Promise<string | null> {
  const raw = await ctx.state.get(CURSOR_KEY);
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

export async function setLastSyncedCursor(
  ctx: PluginContext,
  cursor: string | null,
): Promise<void> {
  if (cursor === null) {
    await ctx.state.delete(CURSOR_KEY);
    return;
  }
  await ctx.state.set(CURSOR_KEY, cursor);
}
