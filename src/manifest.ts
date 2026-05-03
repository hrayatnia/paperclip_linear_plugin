import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip-plugin-linear";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Linear sync",
  description:
    "Mirrors Linear tickets into Paperclip on a schedule and pushes Paperclip updates back to Linear.",
  author: "Sam Rayatnia",
  categories: ["connector", "automation"],
  capabilities: [
    "jobs.schedule",
    "events.subscribe",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  jobs: [
    {
      jobKey: "linear-sync",
      displayName: "Linear sync",
      description: "Pulls updated Linear issues and mirrors them as Paperclip issues.",
      schedule: "*/5 * * * *",
    },
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      linear: {
        type: "object",
        properties: {
          teamKey: {
            type: "string",
            description: "Linear team key, e.g. \"ENG\".",
          },
          issueFilter: {
            type: "object",
            description:
              "Optional Linear API filter passed verbatim to client.issues({ filter }).",
            additionalProperties: true,
          },
        },
        required: ["teamKey"],
        additionalProperties: false,
      },
      paperclip: {
        type: "object",
        properties: {
          defaultProjectId: {
            type: "string",
            description: "Paperclip project to create mirrored issues in.",
          },
          defaultAgentId: {
            type: "string",
            description: "Agent that handles each mirrored issue.",
          },
        },
        required: ["defaultProjectId", "defaultAgentId"],
        additionalProperties: false,
      },
      cronSchedule: {
        type: "string",
        description: "Override for the cron schedule. 5-field cron syntax.",
        default: "*/5 * * * *",
      },
      syncEnabled: {
        type: "boolean",
        description: "Master kill-switch for the cron job.",
        default: true,
      },
    },
    required: ["linear", "paperclip"],
    additionalProperties: false,
  },
};

export default manifest;
