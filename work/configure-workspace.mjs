import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const file = path.join(root, '.pi/settings.json');
if (!fs.existsSync(file)) {
  fs.writeFileSync(file, JSON.stringify({ extensions: [
    path.join(root, 'work/pi-interactive-subagents/pi-extension/subagents/index.ts'),
    path.join(root, 'work/runtime/pi/node_modules/pi-web-access/index.ts'),
  ] }, null, 2) + '\n');
}
const global = path.join(root, 'work/pi-agent/settings.json');
if (!fs.existsSync(global)) fs.writeFileSync(global, JSON.stringify({ retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000 } }, null, 2) + '\n');
