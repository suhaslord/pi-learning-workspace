import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { resolve } from 'node:path';
import { createJiti } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/jiti-loader.js';
import { loadExtensions } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js';

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { VoiceNote } = await jiti.import(resolve('.pi/extensions/lib/voice-note.ts'));
function transport() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; child.emit('close', 1); };
  child.event = (kind, text) => child.stdout.write(JSON.stringify({ kind, text }) + '\n');
  return child;
}
let child;
const phrases = [];
const note = new VoiceNote(text => phrases.push(text), () => {}, () => (child = transport()));
note.toggle();
assert.equal(note.active, true);
const encoded = JSON.stringify({ kind: 'text', text: 'I think x squared means x times two. Wait, I might be wrong.' });
child.stdout.write(encoded.slice(0, 21)); child.stdout.write(encoded.slice(21) + '\n');
assert.deepEqual(phrases, ['I think x squared means x times two. Wait, I might be wrong.']);
let request = '';
child.stdin.on('data', data => { request += data; });
note.stop();
assert.equal(request, 'stop\n');
child.event('transcribing', 'MIC OFF • transcribing');
note.stop();
assert.equal(child.killed, undefined); // Stopping again must not truncate transcription.
child.event('text', 'Why do we divide by the horizontal change?');
child.event('stopped', 'Mic off. Review words/math, then answer.');
child.emit('close', 0);
assert.equal(note.active, false);
assert.equal(phrases.length, 2);
note.toggle();
const count = phrases.length;
note.dispose();
child.event('text', 'Late text must not reach the closed note');
child.emit('close', 0);
assert.equal(phrases.length, count);
assert.equal(child.stdin.read()?.toString(), 'cancel\n');
const failed = new VoiceNote(() => assert.fail('no text on failure'), () => {}, () => (child = transport()));
failed.toggle(); child.event('error', 'Microphone denied'); child.emit('close', 1);
assert.equal(failed.status, 'Microphone denied'); assert.equal(failed.active, false);
failed.dispose();
console.log('Dictation transport: split messages, raw self-correction, final phrase, cancellation, mic failure passed.');

const loaded = await loadExtensions(['quiz.ts', 'voice.ts'].map(file => resolve('.pi/extensions', file)), process.cwd());
assert.deepEqual(loaded.errors, []);
const quiz = loaded.extensions.flatMap(ext => [...ext.tools.values()]).find(tool => tool.definition.name === 'quiz').definition;
const theme = { fg: (_color, text) => text, bold: text => text };
const raw = 'I think the slope is x times two. Wait, I am unsure.\nWhy does the order matter?';
for (const multiSelect of [false, true]) {
  let screen;
  let complete;
  const ctx = { hasUI: true, ui: { custom: factory => new Promise(resolve => {
    complete = result => { screen.dispose(); resolve(result); };
    screen = factory({ requestRender() {}, terminal: { rows: 35 } }, theme, {}, complete);
  }) } };
  const resultPromise = quiz.execute('voice-test', {
    question: 'Choose your answer', options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }],
    correctAnswer: 'one', explanation: 'One is the correct choice in this simulated test.', shuffle: false, multiSelect,
  }, undefined, undefined, ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(screen.render(80).join('\n').includes('F4 mic'));
  screen.handleInput('\t');
  screen.handleInput('\x1b[200~' + raw + '\x1b[201~');
  screen.handleInput('\t');
  if (multiSelect) {
    screen.handleInput(' ');
    for (let i = 0; i < 3; i++) screen.handleInput('\x1b[B');
  }
  screen.handleInput('\r'); screen.handleInput('\r');
  const result = await resultPromise;
  assert.equal(result.details.note, raw);
  assert.equal(result.details.status, 'answered');
}
console.log('Both quiz modes retain multiline raw reasoning in the tutor result.');

const command = loaded.extensions.flatMap(ext => [...ext.commands.values()]).find(command => command.name === 'voice');
assert.ok(command);
let editorText = 'My existing draft'; let screen; let closed;
const commandPromise = command.handler('', { hasUI: true, ui: {
  getEditorText: () => editorText, setEditorText: value => { editorText = value; },
  custom: factory => new Promise(resolve => {
    closed = result => { screen.dispose(); resolve(result); };
    screen = factory({ requestRender() {}, terminal: { rows: 35 } }, theme, {}, closed);
  }),
} });
await new Promise(resolve => setImmediate(resolve));
assert.ok(screen.render(40).join('\n').includes('F4'));
screen.handleInput(' and my uncertainty'); screen.handleInput('\r');
await commandPromise;
assert.equal(editorText, 'My existing draft and my uncertainty');
console.log('/voice preserves the draft and requires a separate user action to send.');
