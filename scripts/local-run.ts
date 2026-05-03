// Local smoke-test runner for paperclip-plugin-linear.
//
// Wires the plugin's real cron handler (`runLinearSync`) and push handlers
// to a test harness backed by `@paperclipai/plugin-sdk/testing`. Linear API
// calls hit the real Linear API (using LINEAR_API_KEY from .env), but the
// Paperclip-side calls (ctx.issues.create / ctx.issues.update) are stubbed
// and logged so the runner does not require a running Paperclip instance.
//
// Usage:
//   node --env-file=.env --import tsx scripts/local-run.ts [--mode pull|push|both] [--limit N] [--help]
//
// Required env: LINEAR_API_KEY
// Optional env: LINEAR_TEAM_KEY, PAPERCLIP_COMPANY_ID, PAPERCLIP_PROJECT_ID,
//               PAPERCLIP_AGENT_ID, LINEAR_ISSUE_FILTER (JSON string)

import { randomUUID } from "node:crypto";

import { LinearClient } from "@linear/sdk";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Issue } from "@paperclipai/shared";

import manifest from "../src/manifest.js";
import { setMapping } from "../src/state/index.js";
import { runLinearSync } from "../src/sync/pull.js";
import { registerPushHandlers } from "../src/sync/push.js";

type Mode = "pull" | "push" | "both";
type LogLevel = "info" | "warn" | "error" | "debug";
const LOG_LEVELS: readonly LogLevel[] = ["info", "warn", "error", "debug"];

interface Args {
  mode: Mode;
  limit: number | null;
  help: boolean;
}

interface PaperclipConfig {
  companyId: string;
  defaultProjectId: string;
  defaultAgentId: string;
}

interface RunnerConfig {
  syncEnabled: true;
  linear: { teamKey: string; issueFilter?: Record<string, unknown> };
  paperclip: PaperclipConfig;
}

interface StubCounts {
  creates: number;
  updates: number;
}

const USAGE = `paperclip-plugin-linear local runner

Runs the plugin's real cron and push handlers against a fake Paperclip host.
Linear API calls hit the real Linear API; Paperclip-side writes are logged.

Usage:
  npm run local:sync -- [--mode pull|push|both] [--limit N] [--help]

Options:
  --mode pull   Run the cron handler once (default).
  --mode push   Fire synthetic Paperclip events through the push handlers.
  --mode both   Pull, then push.
  --limit N     Cap the number of Linear issues fetched on pull (first page only).
  --help        Print this message.

Environment (loaded via 'node --env-file=.env'):
  LINEAR_API_KEY        (required) Personal Linear API key
  LINEAR_TEAM_KEY       (default: ENG)
  PAPERCLIP_COMPANY_ID  (default: local-company)
  PAPERCLIP_PROJECT_ID  (default: local-project)
  PAPERCLIP_AGENT_ID    (default: local-agent)
  LINEAR_ISSUE_FILTER   (optional) JSON string passed verbatim to Linear's filter

Caveat: --mode pull issues real Linear API requests. Use a test workspace or
the --limit flag to keep the smoke test small.
`;

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { mode: "pull", limit: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--mode": {
        const value = argv[++i];
        if (value !== "pull" && value !== "push" && value !== "both") {
          throw new Error(`--mode must be one of pull|push|both (got ${value ?? "<missing>"})`);
        }
        args.mode = value;
        break;
      }
      case "--limit": {
        const value = argv[++i];
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`--limit must be a positive integer (got ${value ?? "<missing>"})`);
        }
        args.limit = parsed;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function readOptionalJson(envValue: string | undefined): Record<string, unknown> | undefined {
  if (envValue === undefined || envValue.length === 0) return undefined;
  try {
    const parsed = JSON.parse(envValue);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("LINEAR_ISSUE_FILTER must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `LINEAR_ISSUE_FILTER is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function buildConfig(): RunnerConfig {
  const issueFilter = readOptionalJson(process.env["LINEAR_ISSUE_FILTER"]);
  const linear: RunnerConfig["linear"] = {
    teamKey: process.env["LINEAR_TEAM_KEY"] ?? "ENG",
  };
  if (issueFilter !== undefined) linear.issueFilter = issueFilter;
  return {
    syncEnabled: true,
    linear,
    paperclip: {
      companyId: process.env["PAPERCLIP_COMPANY_ID"] ?? "local-company",
      defaultProjectId: process.env["PAPERCLIP_PROJECT_ID"] ?? "local-project",
      defaultAgentId: process.env["PAPERCLIP_AGENT_ID"] ?? "local-agent",
    },
  };
}

function fakeIssue(input: { companyId: string; title: string; description?: string }): Issue {
  const now = new Date();
  return {
    id: `local-issue-${Math.random().toString(36).slice(2, 10)}`,
    companyId: input.companyId,
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: input.title,
    description: input.description ?? null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: null,
    identifier: null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: now,
    updatedAt: now,
  } as Issue;
}

function installLogger(harness: TestHarness): void {
  const original = harness.ctx.logger;
  const wrapped = { ...original } as TestHarness["ctx"]["logger"];
  for (const level of LOG_LEVELS) {
    wrapped[level] = (message, meta) => {
      const tail = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
      console.log(`[${level}] ${message}${tail}`);
      original[level](message, meta);
    };
  }
  harness.ctx.logger = wrapped;
}

function installPaperclipStubs(harness: TestHarness, counts: StubCounts): void {
  const issues = harness.ctx.issues;
  issues.create = async (input) => {
    const stub = fakeIssue(input);
    counts.creates += 1;
    console.log(
      `[would create] paperclip issue: title=${JSON.stringify(input.title)} project=${
        input.projectId ?? "<none>"
      } agent=${input.assigneeAgentId ?? "<none>"} -> id=${stub.id}`,
    );
    return stub;
  };
  issues.update = async (issueId, patch, companyId) => {
    counts.updates += 1;
    console.log(
      `[would update] paperclip issue ${issueId} (company=${companyId}): ${JSON.stringify(patch)}`,
    );
    return fakeIssue({
      companyId,
      title: typeof patch.title === "string" ? patch.title : "(unchanged)",
    });
  };
}

function installLinearKey(harness: TestHarness, apiKey: string): void {
  // The plugin only resolves "linear.apiKey"; preserve the harness's stub for any other ref.
  const original = harness.ctx.secrets.resolve;
  harness.ctx.secrets.resolve = (secretRef) =>
    secretRef === "linear.apiKey" ? Promise.resolve(apiKey) : original(secretRef);
}

// Patch LinearClient.prototype because runLinearSync builds its own client internally,
// so we cannot inject one — capping the first page is the simplest interception point.
function applyLimit(limit: number | null): void {
  if (limit === null) return;
  const proto = LinearClient.prototype as unknown as {
    issues: (args: Record<string, unknown>) => Promise<{
      nodes: unknown[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    }>;
  };
  const original = proto.issues;
  proto.issues = async function patchedIssues(this: LinearClient, args: Record<string, unknown>) {
    const page = await original.call(this, { ...args, first: limit });
    return {
      ...page,
      nodes: page.nodes.slice(0, limit),
      pageInfo: { endCursor: null, hasNextPage: false },
    };
  };
}

async function runPull(harness: TestHarness): Promise<void> {
  console.log("--- pull mode: invoking runLinearSync(ctx) ---");
  const result = await runLinearSync(harness.ctx);
  console.log("--- pull complete ---");
  console.log(JSON.stringify(result, null, 2));
}

async function runPush(harness: TestHarness, companyId: string): Promise<void> {
  console.log("--- push mode: registering push handlers and emitting synthetic events ---");
  registerPushHandlers(harness.ctx);

  const paperclipIssueId = "local-pc-issue-1";
  const linearId = "local-linear-id-1";
  await setMapping(harness.ctx, {
    linearId,
    linearIdentifier: "ENG-LOCAL",
    paperclipIssueId,
    lastSyncedHash: "local-hash",
    updatedAt: new Date().toISOString(),
  });
  console.log(
    `[seed] mapping: paperclipIssueId=${paperclipIssueId} -> linearId=${linearId}`,
  );

  await harness.emit(
    "issue.updated",
    { status: "in_progress" },
    {
      entityId: paperclipIssueId,
      eventId: `local-evt-${randomUUID()}`,
      companyId,
      actorType: "user",
      actorId: "local-user",
    },
  );

  await harness.emit(
    "issue.comment.created",
    { parentEntityId: paperclipIssueId, body: "Synthetic comment from local runner." },
    {
      entityId: "local-comment-1",
      eventId: `local-evt-${randomUUID()}`,
      companyId,
      actorType: "user",
      actorId: "local-user",
    },
  );

  console.log("--- push complete ---");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const apiKey = process.env["LINEAR_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "LINEAR_API_KEY is not set. Add it to .env and rerun (npm run local:sync uses --env-file=.env).",
    );
  }

  applyLimit(args.limit);

  const config = buildConfig();
  const harness = createTestHarness({
    manifest,
    capabilities: [...manifest.capabilities],
    config: { ...config },
  });

  installLogger(harness);
  installLinearKey(harness, apiKey);
  const counts: StubCounts = { creates: 0, updates: 0 };
  installPaperclipStubs(harness, counts);

  if (args.mode === "pull" || args.mode === "both") {
    await runPull(harness);
  }
  if (args.mode === "push" || args.mode === "both") {
    await runPush(harness, config.paperclip.companyId);
  }

  console.log("--- summary ---");
  console.log(
    `paperclip writes stubbed: ${counts.creates} create(s), ${counts.updates} update(s)`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
