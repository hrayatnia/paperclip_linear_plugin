import { LinearClient } from "@linear/sdk";

export function createLinearClient(apiKey: string): LinearClient {
  if (!apiKey) {
    throw new Error("createLinearClient: apiKey is required");
  }
  return new LinearClient({ apiKey });
}
