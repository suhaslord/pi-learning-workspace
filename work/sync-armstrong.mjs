import path from 'node:path';
import { loadExtensions } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js';
const loaded = await loadExtensions([path.resolve('.pi/extensions/armstrong-online.ts')], process.cwd());
if (loaded.errors.length) throw new Error(JSON.stringify(loaded.errors));
const tool = loaded.extensions[0].tools.get('armstrong_materials').definition;
const result = await tool.execute('initial-sync', { resource: 'all', refresh: true }, undefined, undefined, { cwd: process.cwd() });
for (const item of result.details.results) console.log(JSON.stringify(item));
if (result.details.results.some(item => !item.ok || item.message)) process.exitCode = 1;
