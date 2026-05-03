import { describe, expect, it } from "vitest";

import manifest from "../manifest.js";

describe("manifest", () => {
  it("declares a v1 plugin with the expected id", () => {
    expect(manifest.id).toBe("paperclip-plugin-linear");
    expect(manifest.apiVersion).toBe(1);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("declares a linear-sync cron job at every-5-minutes", () => {
    expect(manifest.jobs).toBeDefined();
    expect(manifest.jobs?.length).toBe(1);
    const job = manifest.jobs?.[0];
    expect(job?.jobKey).toBe("linear-sync");
    expect(job?.schedule).toBe("*/5 * * * *");
  });

  it("declares the capabilities the worker actually uses", () => {
    const caps = manifest.capabilities;
    expect(caps).toContain("jobs.schedule");
    expect(caps).toContain("events.subscribe");
    expect(caps).toContain("secrets.read-ref");
    expect(caps).toContain("plugin.state.write");
    expect(caps).toContain("issues.create");
    expect(caps).toContain("issues.update");
    expect(caps).toContain("issue.comments.create");
  });

  it("requires linear.teamKey and paperclip.{companyId,defaultProjectId,defaultAgentId} in config", () => {
    const schema = manifest.instanceConfigSchema as
      | { properties?: Record<string, { required?: string[] }> }
      | undefined;
    expect(schema?.properties?.["linear"]?.required).toContain("teamKey");
    expect(schema?.properties?.["paperclip"]?.required).toContain("companyId");
    expect(schema?.properties?.["paperclip"]?.required).toContain("defaultProjectId");
    expect(schema?.properties?.["paperclip"]?.required).toContain("defaultAgentId");
  });
});
