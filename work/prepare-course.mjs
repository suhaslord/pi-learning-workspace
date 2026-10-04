import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createJiti } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/jiti-loader.js';

const run = promisify(execFile);
const root = process.cwd();
const jiti = createJiti(import.meta.url);
const { learningConfig } = await jiti.import(path.join(root, '.pi/extensions/lib/learning-vault.ts'));
const { refreshArmstrong, download } = await jiti.import(path.join(root, '.pi/extensions/lib/armstrong-online.ts'));
const { extractLinks, fetchArmstrongLink, embeddedArmstrongLinks } = await jiti.import(path.join(root, '.pi/extensions/lib/armstrong-linked.ts'));
const vault = learningConfig(root).vault;
const folder = path.join(vault, 'Sources/Armstrong Online');
const refresh = process.argv.includes('--refresh');
const atomic = (file, value) => { fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const snapshots = [];
for (const resource of ['notes', 'assessments', 'schedule']) {
  let result;
  const metadata = path.join(folder, resource + '.json');
  if (!refresh && fs.existsSync(metadata)) result = read(metadata);
  if (!result?.ok || !result.files?.every(file => fs.existsSync(file)) || refresh) result = await refreshArmstrong(root, resource, refresh);
  if (!result.ok) throw new Error(`${resource}: ${result.message}. Existing course library has not been replaced.`);
  snapshots.push(result);
}
const associations = [];
for (const snapshot of snapshots.filter(item => item.resource !== 'schedule')) {
  const pdf = snapshot.files.find(file => file.endsWith('.pdf'));
  if (!pdf) throw new Error(`No current ${snapshot.resource} PDF. Keep the existing course library.`);
  for (const link of await extractLinks(pdf)) associations.push({ ...link, index: snapshot.resource, indexFetchedAt: snapshot.fetchedAt });
}
const unique = [...new Map(associations.map(link => [link.url, link])).values()];
const assets = new Map();
const failures = [];
async function retrieve(link) {
  const id = /\/d\/([A-Za-z0-9_-]+)/.exec(link.url)?.[1];
  const metadata = path.join(folder, 'Linked', id + '.json');
  const imageMetadata = path.join(folder, 'Linked', id + '.image.json');
  if (!refresh && fs.existsSync(imageMetadata)) {
    const cached = read(imageMetadata);
    if (cached.ok && cached.path && fs.existsSync(cached.path)) return { ...cached, cached: true };
  }
  if (!refresh && fs.existsSync(metadata)) {
    const cached = read(metadata);
    if (cached.ok && cached.path && fs.existsSync(cached.path) && fs.readFileSync(cached.path).subarray(0, 5).toString() === '%PDF-') return { ...cached, cached: true };
  }
  const result = await fetchArmstrongLink(root, link, refresh);
  if (result.ok || !result.message?.includes('not a PDF') || !link.url.startsWith('https://drive.google.com/file/d/')) return result;
  // One published exercise is an original image, not a PDF. Preserve that format.
  try {
    const original = await download(`https://drive.google.com/uc?export=download&id=${id}`, undefined, fetch);
    const format = original.subarray(0, 3).toString('hex') === 'ffd8ff' ? 'jpg' : original.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'png' : undefined;
    if (!format) return result;
    const file = path.join(folder, 'Linked', id + '.' + format);
    fs.writeFileSync(file + '.tmp', original);
    fs.renameSync(file + '.tmp', file);
    const image = { url: link.url, ok: true, format: 'image', path: file, pages: 1, fetchedAt: new Date().toISOString(), message: 'Original image worksheet: inspect with the image-capable read tool; no PDF/text conversion is implied.' };
    atomic(imageMetadata, image);
    return image;
  } catch { return result; }
}
async function batch(links, depth) {
  let cursor = 0;
  const nested = [];
  await Promise.all(Array.from({ length: Math.min(3, links.length) }, async () => {
    while (cursor < links.length) {
      const link = links[cursor++];
      if (assets.has(link.url)) continue;
      const result = await retrieve(link);
      assets.set(link.url, { ...result, depth });
      if (!result.ok) { failures.push({ link, message: result.message }); continue; }
      if (result.format === 'image') { console.log(`Cached original image worksheet: ${link.label}`); continue; }
      const textFile = result.path.replace(/\.pdf$/, '.txt');
      if (refresh || !fs.existsSync(textFile) || fs.statSync(result.path).mtimeMs > fs.statSync(textFile).mtimeMs) await run('pdftotext', ['-layout', result.path, textFile], { timeout: 30000, maxBuffer: 1024 * 1024 });
      assets.get(link.url).textPath = textFile;
      try {
        const refs = await run('python3', [path.join(root, '.pi/extensions/lib/armstrong-links.py'), result.path, '--all'], { timeout: 35000, maxBuffer: 4 * 1024 * 1024 });
        assets.get(link.url).references = JSON.parse(refs.stdout);
        if (depth < 2) for (const child of await embeddedArmstrongLinks(link, result)) {
          for (const parent of associations.filter(item => item.url === link.url)) {
            const associated = { ...child, context: parent.context, label: `${parent.label} — attachment: ${child.label}`, parentUrl: link.url };
            associations.push(associated);
            nested.push(associated);
          }
        }
      } catch (error) { failures.push({ link, message: `Attachment/reference extraction failed: ${error.message}` }); }
      console.log(`Cached ${assets.size} source files: ${link.context || link.label}`);
    }
  }));
  const next = [...new Map(nested.filter(link => !assets.has(link.url)).map(link => [link.url, link])).values()];
  if (next.length && assets.size + next.length <= 200) await batch(next, depth + 1);
  else if (next.length) failures.push({ message: 'Stopped at 200 indexed files; remaining attachments require review.' });
}
await batch(unique, 0);
const supplements = [];
const supplementFolder = path.join(vault, 'Sources/OpenStax');
fs.mkdirSync(supplementFolder, { recursive: true });
for (const volume of [1, 2]) {
  const url = `https://assets.openstax.org/oscms-prodcms/media/documents/calculus-volume-${volume}_-_WEB.pdf`;
  const file = path.join(supplementFolder, `Calculus Volume ${volume}.pdf`);
  const metadata = file.replace(/\.pdf$/, '.json');
  let result = fs.existsSync(metadata) ? read(metadata) : undefined;
  if (!result || !fs.existsSync(file) || refresh) {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`OpenStax volume ${volume}: HTTP ${response.status}`);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 120 * 1024 * 1024) throw new Error('OpenStax PDF exceeds 120 MB limit');
      chunks.push(chunk);
    }
    const pdf = Buffer.concat(chunks);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('OpenStax returned a non-PDF response');
    fs.writeFileSync(file + '.tmp', pdf);
    await run('pdfinfo', [file + '.tmp'], { timeout: 30000, maxBuffer: 1024 * 1024 });
    fs.renameSync(file + '.tmp', file);
    result = { volume, url, path: file, fetchedAt: new Date().toISOString(), bytes };
    atomic(metadata, result);
  }
  const textPath = file.replace(/\.pdf$/, '.txt');
  if (refresh || !fs.existsSync(textPath)) await run('pdftotext', ['-layout', file, textPath], { timeout: 60000, maxBuffer: 1024 * 1024 });
  supplements.push({ ...result, textPath });
  console.log(`OpenStax volume ${volume} cached with searchable text.`);
}
const schedule = await run('python3', [path.join(root, 'work/read-schedule.py'), path.join(folder, 'Schedule.xlsx')], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
atomic(path.join(folder, 'course-sources.json'), { builtAt: new Date().toISOString(), snapshots, associations, assets: [...assets.values()], failures, supplements, workbook: JSON.parse(schedule.stdout) });
if (!process.argv.includes('--sources-only')) {
  const resources = await run('python3', [path.join(root, 'work/collect-course-resources.py')], { timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
  console.log(resources.stdout.trim());
  const built = await run('python3', [path.join(root, 'work/build-course.py'), vault], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  console.log(built.stdout.trim());
}
console.log(`Source cache: ${assets.size} indexed files, ${failures.length} retrieval/extraction issues. Saved course-sources.json.`);
