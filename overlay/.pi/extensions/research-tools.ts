import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface SubagentRegistry {
  registerToolExtension(name: string, extensionPath: string): void;
}

export default function (pi: ExtensionAPI) {
  const webExtension = fileURLToPath(
    new URL("../../work/runtime/pi/node_modules/pi-web-access/index.ts", import.meta.url),
  );
  pi.on("session_start", async () => {
    const registry = (globalThis as typeof globalThis & {
      __pi_interactive_subagents?: SubagentRegistry;
    }).__pi_interactive_subagents;
    for (const name of ["web_search", "web_fetch", "get_search_content"]) {
      registry?.registerToolExtension(name, resolve(webExtension));
    }
  });
}
