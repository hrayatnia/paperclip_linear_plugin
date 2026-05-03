import { createHash } from "node:crypto";

import type { Issue } from "@paperclipai/plugin-sdk";

import type { LinearIssueSnapshot } from "../linear/index.js";

export function mapLinearStateToPaperclipStatus(stateName: string): Issue["status"] {
  switch (stateName.trim().toLowerCase()) {
    case "todo":
    case "backlog":
      return "todo";
    case "in progress":
      return "in_progress";
    case "in review":
      return "in_review";
    case "done":
    case "cancelled":
    case "canceled":
      return "done";
    default:
      return "todo";
  }
}

export function mapLinearPriorityToPaperclip(priority: number): Issue["priority"] {
  switch (priority) {
    case 1:
      return "critical";
    case 2:
      return "high";
    case 3:
      return "medium";
    case 4:
      return "low";
    default:
      return "medium";
  }
}

export function hashLinearSnapshot(snapshot: LinearIssueSnapshot): string {
  const payload = {
    title: snapshot.title,
    description: snapshot.description,
    stateName: snapshot.stateName,
    priority: snapshot.priority,
    assigneeEmail: snapshot.assigneeEmail,
    updatedAt: snapshot.updatedAt,
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

export function buildIssueDescription(snapshot: LinearIssueSnapshot): string {
  const header = `Linear: [${snapshot.identifier}](${snapshot.url})`;
  const body = snapshot.description?.trim() ?? "";
  return body.length > 0 ? `${header}\n\n${body}` : header;
}
