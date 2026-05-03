import type { PluginContext } from "@paperclipai/plugin-sdk";

import { createLinearClient, fetchUpdatedIssues } from "../linear/index.js";
import { getLastSyncedCursor, getMapping, setLastSyncedCursor, setMapping } from "../state/index.js";

import {
  buildIssueDescription,
  hashLinearSnapshot,
  mapLinearPriorityToPaperclip,
  mapLinearStateToPaperclipStatus,
} from "./mapping.js";

export interface LinearSyncResult {
  created: number;
  updated: number;
  skipped: number;
}

const LINEAR_API_KEY_SECRET_REF = "linear.apiKey";

interface ResolvedConfig {
  syncEnabled: boolean;
  companyId: string;
  defaultProjectId: string;
  defaultAgentId: string;
  teamKey: string | undefined;
  issueFilter: Record<string, unknown> | undefined;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readConfig(raw: Record<string, unknown>): ResolvedConfig {
  const linear = (raw["linear"] as Record<string, unknown> | undefined) ?? {};
  const paperclip = (raw["paperclip"] as Record<string, unknown> | undefined) ?? {};
  const issueFilter = linear["issueFilter"];
  return {
    syncEnabled: raw["syncEnabled"] !== false,
    companyId: readString(paperclip, "companyId"),
    defaultProjectId: readString(paperclip, "defaultProjectId"),
    defaultAgentId: readString(paperclip, "defaultAgentId"),
    teamKey: typeof linear["teamKey"] === "string" ? (linear["teamKey"] as string) : undefined,
    issueFilter:
      typeof issueFilter === "object" && issueFilter !== null
        ? (issueFilter as Record<string, unknown>)
        : undefined,
  };
}

function maxIsoTimestamp(a: string | null, b: string): string {
  if (!a) return b;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export async function runLinearSync(ctx: PluginContext): Promise<LinearSyncResult> {
  const config = readConfig(await ctx.config.get());

  if (!config.syncEnabled) {
    ctx.logger.info("runLinearSync: sync disabled via config; skipping");
    return { created: 0, updated: 0, skipped: 0 };
  }

  const apiKey = await ctx.secrets.resolve(LINEAR_API_KEY_SECRET_REF);
  const cursor = await getLastSyncedCursor(ctx);
  const client = createLinearClient(apiKey);

  const filter: { teamKey?: string; issueFilter?: Record<string, unknown> } = {};
  if (config.teamKey !== undefined) filter.teamKey = config.teamKey;
  if (config.issueFilter !== undefined) filter.issueFilter = config.issueFilter;

  const result = await fetchUpdatedIssues(client, cursor, filter);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let highWatermark: string | null = cursor;

  for (const issue of result.issues) {
    highWatermark = maxIsoTimestamp(highWatermark, issue.updatedAt);
    const hash = hashLinearSnapshot(issue);
    const existing = await getMapping(ctx, issue.id);

    if (existing && hash === existing.lastSyncedHash) {
      skipped += 1;
      continue;
    }

    let paperclipIssueId: string;
    if (existing == null) {
      const createdIssue = await ctx.issues.create({
        companyId: config.companyId,
        projectId: config.defaultProjectId,
        assigneeAgentId: config.defaultAgentId,
        title: issue.title,
        description: buildIssueDescription(issue),
        status: "todo",
        priority: mapLinearPriorityToPaperclip(issue.priority),
      });
      paperclipIssueId = createdIssue.id;
      created += 1;
    } else {
      await ctx.issues.update(
        existing.paperclipIssueId,
        {
          title: issue.title,
          description: buildIssueDescription(issue),
          status: mapLinearStateToPaperclipStatus(issue.stateName),
        },
        config.companyId,
      );
      paperclipIssueId = existing.paperclipIssueId;
      updated += 1;
    }

    await setMapping(ctx, {
      linearId: issue.id,
      linearIdentifier: issue.identifier,
      paperclipIssueId,
      lastSyncedHash: hash,
      updatedAt: new Date().toISOString(),
    });
  }

  if (highWatermark !== null && highWatermark !== cursor) {
    await setLastSyncedCursor(ctx, highWatermark);
  }

  ctx.logger.info("runLinearSync: complete", { created, updated, skipped });
  return { created, updated, skipped };
}
