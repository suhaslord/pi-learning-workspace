import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync('dependencies.json', 'utf8'));
assert.equal(process.version, `v${manifest.node}`, 'Installed Node version differs from the manifest');
for (const [name, version] of [['@earendil-works/pi-coding-agent', manifest.pi], ['pi-web-access', manifest.webAccess]]) {
  assert.equal(JSON.parse(fs.readFileSync(`work/runtime/pi/node_modules/${name}/package.json`, 'utf8')).version, version);
}
for (const [folder, name] of [['.pi', 'learn'], ['work/pi-interactive-subagents', 'subagents']]) {
  assert.equal(execFileSync('git', ['-C', folder, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), manifest[name].commit);
}
for (const file of ['.pi/learning-runtime.json', '.pi/settings.json', 'outputs/Learning Vault/Home.md', 'work/voice-notes.py']) assert.ok(fs.existsSync(file), `Missing ${file}`);
const { loadExtensions } = await import('./runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js');
const files = fs.readdirSync('.pi/extensions').filter(name => name.endsWith('.ts')).map(name => path.join(root, '.pi/extensions', name));
files.push(path.join(root, 'work/pi-interactive-subagents/pi-extension/subagents/index.ts'));
files.push(path.join(root, 'work/runtime/pi/node_modules/pi-web-access/index.ts'));
files.push(path.join(root, '.pi/extensions/visual-tools/index.ts'));
const loaded = await loadExtensions(files, root);
assert.deepEqual(loaded.errors, [], 'One or more extensions failed to load');
console.log(`Install verified: ${loaded.extensions.length} extensions loaded; pinned sources/runtime and blank vault present. No AI request or microphone recording was made.`);
