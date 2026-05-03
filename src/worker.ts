import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

import { runLinearSync } from "./sync/pull.js";
import { registerPushHandlers } from "./sync/push.js";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("paperclip-plugin-linear: setup");

    ctx.jobs.register("linear-sync", async (job) => {
      ctx.logger.info("linear-sync run starting", {
        runId: job.runId,
        trigger: job.trigger,
      });
      try {
        const result = await runLinearSync(ctx);
        ctx.logger.info("linear-sync run finished", {
          runId: job.runId,
          ...result,
        });
      } catch (err) {
        ctx.logger.error("linear-sync run failed", {
          runId: job.runId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    });

    registerPushHandlers(ctx);
  },

  async onHealth() {
    return { status: "ok", message: "paperclip-plugin-linear ready" };
  },

  async onValidateConfig(config) {
    const errors: string[] = [];
    if (!config || typeof config !== "object") {
      return { ok: false, errors: ["Plugin config object is required."] };
    }
    const cfg = config as Record<string, unknown>;
    const linear = cfg["linear"] as Record<string, unknown> | undefined;
    if (!linear || typeof linear["teamKey"] !== "string" || linear["teamKey"].length === 0) {
      errors.push("linear.teamKey is required.");
    }
    const paperclip = cfg["paperclip"] as Record<string, unknown> | undefined;
    if (!paperclip) {
      errors.push("paperclip.defaultProjectId and paperclip.defaultAgentId are required.");
    } else {
      if (typeof paperclip["defaultProjectId"] !== "string") {
        errors.push("paperclip.defaultProjectId is required.");
      }
      if (typeof paperclip["defaultAgentId"] !== "string") {
        errors.push("paperclip.defaultAgentId is required.");
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
