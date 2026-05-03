import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";

import {
  commentOnLinearIssue,
  createLinearClient,
  updateLinearIssue,
  type LinearClient,
  type LinearIssuePatch,
} from "../linear/index.js";
import { findMappingByPaperclipIssueId } from "../state/index.js";

const LINEAR_API_KEY_SECRET_REF = "linear.apiKey";
const PUSH_SEEN_KEY_PREFIX = "linear-push-seen:";

const PAPERCLIP_TO_LINEAR_STATE: Readonly<Record<string, string>> = {
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Backlog",
  backlog: "Backlog",
};

export function mapPaperclipStatusToLinearState(status: string): string | null {
  return PAPERCLIP_TO_LINEAR_STATE[status] ?? null;
}

interface IssueUpdatedPayload {
  status?: string;
}

interface IssueCommentCreatedPayload {
  parentEntityId?: string;
  body?: string;
}

export function registerPushHandlers(ctx: PluginContext): void {
  ctx.events.on("issue.updated", async (event) => {
    await handleIssueUpdated(ctx, event as PluginEvent<IssueUpdatedPayload>);
  });

  ctx.events.on("issue.comment.created", async (event) => {
    await handleIssueCommentCreated(ctx, event as PluginEvent<IssueCommentCreatedPayload>);
  });
}

async function handleIssueUpdated(
  ctx: PluginContext,
  event: PluginEvent<IssueUpdatedPayload>,
): Promise<void> {
  const paperclipIssueId = event.entityId;
  if (!paperclipIssueId) return;

  const mapping = await findMappingByPaperclipIssueId(ctx, paperclipIssueId);
  if (!mapping) return;

  if (await alreadySeen(ctx, event.eventId)) return;

  const status = event.payload?.status;
  const stateName = typeof status === "string" ? mapPaperclipStatusToLinearState(status) : null;
  if (stateName === null) {
    await markSeen(ctx, event.eventId);
    return;
  }

  const patch: LinearIssuePatch = { stateName };
  const client = await resolveLinearClient(ctx);
  try {
    await updateLinearIssue(client, mapping.linearId, patch);
    await markSeen(ctx, event.eventId);
  } catch (err) {
    ctx.logger.error("linear push (issue.updated) failed", {
      eventId: event.eventId,
      paperclipIssueId,
      linearId: mapping.linearId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function handleIssueCommentCreated(
  ctx: PluginContext,
  event: PluginEvent<IssueCommentCreatedPayload>,
): Promise<void> {
  if (event.actorType === "plugin" && event.actorId === ctx.manifest.id) return;

  const issueId = event.payload?.parentEntityId;
  if (!issueId) return;

  const mapping = await findMappingByPaperclipIssueId(ctx, issueId);
  if (!mapping) return;

  if (await alreadySeen(ctx, event.eventId)) return;

  const body = event.payload?.body;
  if (typeof body !== "string" || body.length === 0) {
    await markSeen(ctx, event.eventId);
    return;
  }

  const client = await resolveLinearClient(ctx);
  try {
    await commentOnLinearIssue(client, mapping.linearId, body);
    await markSeen(ctx, event.eventId);
  } catch (err) {
    ctx.logger.error("linear push (issue.comment.created) failed", {
      eventId: event.eventId,
      paperclipIssueId: issueId,
      linearId: mapping.linearId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function alreadySeen(ctx: PluginContext, eventId: string): Promise<boolean> {
  const stored = await ctx.state.get({
    scopeKind: "instance",
    stateKey: PUSH_SEEN_KEY_PREFIX + eventId,
  });
  return stored !== null && stored !== undefined;
}

async function markSeen(ctx: PluginContext, eventId: string): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: PUSH_SEEN_KEY_PREFIX + eventId },
    true,
  );
}

async function resolveLinearClient(ctx: PluginContext): Promise<LinearClient> {
  const apiKey = await ctx.secrets.resolve(LINEAR_API_KEY_SECRET_REF);
  return createLinearClient(apiKey);
}
