import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatMathForTerminal } from "./lib/terminal-math.ts";

export default function (pi: ExtensionAPI) {
  pi.registerMarkdownTransformer((markdown, context) => formatMathForTerminal(markdown, {
    displayBlocks: true,
    maxWidth: Math.max(1, context.availableWidth - 4),
  }));
}
