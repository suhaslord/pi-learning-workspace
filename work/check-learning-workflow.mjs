import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadExtensions } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js';
import { AgentSession, SessionManager, convertToLlm } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js';

const root = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-check-'));
try {
  fs.mkdirSync(path.join(scratch, '.pi'));
  fs.writeFileSync(path.join(scratch, '.pi/learning.json'), JSON.stringify({ vaultPath: 'vault', autoLog: true }));
  fs.mkdirSync(path.join(scratch, 'work'));
  fs.copyFileSync(path.join(root, 'work/extract-docx.py'), path.join(scratch, 'work/extract-docx.py'));
  const loaded = await loadExtensions(['md-log.ts', 'learning-workflow.ts', 'class-materials.ts'].map(file => path.join(root, '.pi/extensions', file)), root);
  assert.deepEqual(loaded.errors, []);
  const extensions = loaded.extensions;
  const commands = new Map(extensions.flatMap(extension => [...extension.commands]));
  const tools = new Map(extensions.flatMap(extension => [...extension.tools]));
  let entries = [{ type: 'message', id: 'm1', parentId: null, message: { role: 'user', content: 'Learn calculus' } }];
  const notices = [];
  const sent = [];
  loaded.runtime.appendEntry = (customType, data) => entries.push({ type: 'custom', customType, data, id: `e${entries.length}`, parentId: entries.at(-1)?.id });
  loaded.runtime.sendUserMessage = (content, options) => sent.push({ content, options });
  const ctx = { cwd: scratch, isIdle: () => true, sessionManager: {
    getEntries: () => [...entries, { type: 'message', id: 'other-branch', parentId: null, message: { role: 'user', content: 'WRONG BRANCH' } }], getBranch: () => entries, getSessionId: () => 'test-session',
    getHeader: () => ({ timestamp: '2026-10-03T12:00:00Z' }), getSessionName: () => 'Test lesson',
  }, ui: { theme: { fg: (_color, text) => text }, setStatus: () => {}, notify: (text, level) => notices.push({ text, level }) } };
  const emit = async (name, event) => { for (const extension of extensions) for (const handler of extension.handlers.get(name) ?? []) await handler(event, ctx); };
  await emit('session_start', {});
  for (const handler of extensions.find(extension => extension.tools.has('learning_checkpoint')).handlers.get('before_agent_start') ?? []) {
    const policy = await handler({ prompt: 'Learn a topic', systemPrompt: 'Existing system guidance' }, ctx);
    if (!policy?.systemPrompt) continue;
    assert.ok(policy.systemPrompt.startsWith('Existing system guidance\n'));
    assert.ok(policy.systemPrompt.includes('small Mermaid dependency graph') && policy.systemPrompt.includes('invoke quiz in the same turn'));
    assert.ok(policy.systemPrompt.includes('in-depth teaching is the default') && policy.systemPrompt.includes('no extra study-lock release requirements'), 'Runtime depth policy must preserve the existing release contract');
    assert.ok(policy.systemPrompt.includes("learner's demonstrated knowledge edge") && policy.systemPrompt.includes('system absorbs logistics'), 'Video principles apply even before a runtime has been armed');
    assert.ok(policy.systemPrompt.includes('Resolve learner clarifications before advancing') && policy.systemPrompt.includes('not a fixed script or question quota'));
  }
  const vault = path.join(scratch, 'vault');
  const transcript = path.join(vault, 'Sessions/2026-10-03-test-session.md');
  assert.ok(fs.readFileSync(transcript, 'utf8').includes('Learn calculus'));
  assert.ok(!fs.readFileSync(transcript, 'utf8').includes('WRONG BRANCH'));
  assert.ok(fs.readFileSync(path.join(vault, 'Current Lesson.md'), 'utf8').includes('test-session'));
  await emit('session_start', {});
  assert.equal(fs.readFileSync(transcript, 'utf8').split('Learn calculus').length, 2, 'Reload must not duplicate history');
  assert.equal(entries.filter(entry => entry.customType === 'md-log').length, 1);
  const formula = 'Inline \\(x^2\\).\n\\[\n\\frac{1}{2}\n\\]\n`\\(literal\\)`\n```text\n\\[literal\\]\n```';
  const mathMessage = { role: 'assistant', content: [{ type: 'text', text: formula }] };
  entries.push({ type: 'message', id: 'math-entry', parentId: entries.at(-1).id, message: mathMessage });
  await emit('message_end', { message: mathMessage });
  const mathLog = fs.readFileSync(transcript, 'utf8');
  assert.ok(mathLog.includes('$x^2$') && mathLog.includes('$$\n\\frac{1}{2}\n$$'));
  assert.ok(mathLog.includes('`\\(literal\\)`') && mathLog.includes('```text\n\\[literal\\]\n```'), 'Preserve code literals');
  await emit('message_end', { message: { role: 'assistant', content: [{ type: 'text', text: 'Read $\frac{d}{dx}x^2$ and $\theta$.' }] } });
  const repairedLog = fs.readFileSync(transcript, 'utf8');
  assert.ok(repairedLog.includes(String.raw`$\frac{d}{dx}x^2$`) && repairedLog.includes(String.raw`$\theta$`), 'Repair JSON control escapes inside math');
  assert.ok(!repairedLog.includes('\f'), 'No form-feed truncation in rendered math');
  await emit('session_start', {});
  assert.equal(fs.readFileSync(transcript, 'utf8').split('$x^2$').length, 2, 'Backfill uses the same math delimiters without duplication');
  const pending = { toolName: 'quiz', toolCallId: 'q1', args: { question: 'Evaluate $x^2$', explanation: 'SECRET ANSWER' }, partialResult: { details: { options: [{ index: 1, label: '$4$' }, { index: 2, label: '$9$' }] } } };
  await emit('tool_execution_update', pending);
  await emit('tool_execution_update', pending);
  const live = fs.readFileSync(transcript, 'utf8');
  assert.ok(live.includes('$x^2$') && live.includes('1. $4$'), 'Keep original math and shuffled order');
  assert.ok(!live.includes('SECRET ANSWER'), 'Never leak feedback before answering');
  assert.equal(live.split('Evaluate').length, 2, 'Question updates must not duplicate');
  await commands.get('md-unlog').handler('', ctx);
  await emit('session_start', {});
  const before = fs.readFileSync(transcript, 'utf8');
  await emit('message_end', { message: { role: 'user', content: 'Do not log this' } });
  assert.equal(fs.readFileSync(transcript, 'utf8'), before, 'Unlog must survive reload');
  entries = [];
  process.env.PI_SUBAGENT_ID = 'test-child';
  await emit('session_start', {});
  delete process.env.PI_SUBAGENT_ID;
  assert.equal(entries.length, 0, 'Child sessions must not automatically log');

  const workflow = extensions.find(extension => extension.tools.has('learning_checkpoint'));
  const start = workflow.handlers.get('before_agent_start')[0];
  const settle = workflow.handlers.get('agent_before_settle')[0];
  await start({ prompt: '<skill name="teach">Teaching guidance</skill>Learn chain rule', systemPrompt: 'Base prompt' }, ctx);
  entries = [{ type: 'message', id: 'guard', message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the plan. Does it fit what you want?' }] } }];
  const boundary = { outcome: 'completed', context: { canContinue: false, pendingMessages: [] } };
  assert.equal(await settle(boundary, ctx), undefined, 'Do not turn plan approval into a quiz');
  entries[0].message.content[0].text = 'Check your reasoning: For $y=(2x+1)^2$, which derivative expression keeps both rate factors? Add a note.';
  assert.equal(await settle({ ...boundary, outcome: 'aborted' }, ctx), undefined, 'Respect cancellation');
  assert.equal(await settle({ ...boundary, outcome: 'error' }, ctx), undefined, 'Do not retry provider errors');
  assert.equal(await settle({ ...boundary, context: { canContinue: true, pendingMessages: [{ role: 'user', content: 'Stop' }] } }, ctx), undefined, 'Leave queued user input in control');
  const recovered = await settle(boundary, ctx);
  assert.equal(recovered.continue, true);
  assert.equal(recovered.entries[0].display, false, 'Recovery is internal guidance, not a fake student reply');
  assert.ok(recovered.entries[0].content.includes('that same question'));
  const boundarySession = SessionManager.inMemory(scratch);
  boundarySession.appendMessage(entries[0].message);
  assert.equal(convertToLlm(boundarySession.buildSessionProjection().messages).at(-1).role, 'assistant');
  const continuation = await AgentSession.prototype._runBeforeSettleBoundary.call({
    _extensionRunner: { hasHandlers: () => true, emitBoundary: async () => recovered },
    _lastActivityOutcome: 'completed',
    _commitBoundaryDrafts: drafts => drafts.forEach(draft => boundarySession.appendCustomMessageEntry(draft.customType, draft.content, draft.display)),
    _flushPendingCustomMessages: () => {},
    _buildBoundaryContext: () => ({ canContinue: convertToLlm(boundarySession.buildSessionProjection().messages).at(-1).role !== 'assistant' }),
    _reportInvalidBoundaryContinuation: () => assert.fail('Invalid SDK continuation'),
    agent: { hasQueuedMessages: () => false },
  });
  assert.equal(continuation, true, 'The installed SDK actually schedules the recovery request');
  assert.equal(convertToLlm(boundarySession.buildSessionProjection().messages).at(-1).role, 'user', 'The real SDK projects internal guidance into a continuable boundary');
  assert.equal(boundarySession.getBranch().at(-1).display, false);
  assert.equal(await settle(boundary, ctx), undefined, 'Only one recovery per activity');
  await start({ prompt: 'Wrap up this lesson now. Save evidence and stop.', systemPrompt: 'Base prompt' }, ctx);
  assert.equal(await settle(boundary, ctx), undefined, 'Never resume a wrapped-up lesson');
  await start({ prompt: '<skill name="teach">Guide</skill>Please pause here.', systemPrompt: 'Base prompt' }, ctx);
  assert.equal(await settle(boundary, ctx), undefined, 'Respect a natural-language pause');
  for (const handler of workflow.handlers.get('tool_call')) await handler({ toolName: 'quiz' }, ctx);
  for (const handler of workflow.handlers.get('tool_result')) await handler({ toolName: 'quiz', details: { status: 'cancelled' } }, ctx);
  assert.equal(await settle(boundary, ctx), undefined, 'Escape cancellation must not reopen quiz controls');
  const callAfterCancel = await workflow.handlers.get('tool_call')[0]({ toolName: 'quiz' }, ctx);
  assert.equal(callAfterCancel.block, true, 'A model reissue after Escape is blocked until new learner input');
  await start({ prompt: 'Continue please', systemPrompt: 'Base' }, ctx);
  assert.equal(await workflow.handlers.get('tool_call')[0]({ toolName: 'quiz' }, ctx), undefined, 'An explicit new request permits another check');
  entries = [];
  console.log('Forgotten quiz controls recover once; plan approval, cancellation, errors and wrap-up are respected.');

  const checkpoint = tools.get('learning_checkpoint').definition;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const claim = 'Correctly identified the inner input in a prior attempt';
  const reviewedEvidence = { quizId: 'confirmed-inner', understanding: claim, reasoningSound: true, review: 'The actual attempt correctly identifies the inner input and explains the nesting.' };
  entries.push({ type: 'message', id: 'inner-answer', message: { role: 'toolResult', toolName: 'quiz', toolCallId: reviewedEvidence.quizId, isError: false,
    details: { status: 'answered', correct: true, question: 'Identify the inner input', note: 'The outer function receives the output of the inner function.' } } });
  const lessonPlan = { goalNode: 'chain', nodes: [
    { id: 'inner', label: 'Identify inner input', dependsOn: [], status: 'confirmed', quizId: reviewedEvidence.quizId },
    { id: 'chain', label: 'Track nested rates', dependsOn: ['inner'], status: 'current' },
  ] };
  const params = { topic: 'Chain rule', goal: 'Track nested functions', understood: [claim], needsPractice: ['Unconfirmed transfer'], nextStep: 'Try a changed nested example', sources: ['Test fixture only'], reviewOn: date,
    evidence: [reviewedEvidence], lessonPlan, frontier: [{ strand: 'Function composition', floor: claim, floorQuizId: reviewedEvidence.quizId, uncertainty: 'Changed-example transfer is not tested yet.' }] };
  await assert.rejects(() => checkpoint.execute('unsupported', { ...params, evidence: [] }, undefined, undefined, ctx), /New understanding needs evidence/);
  await assert.rejects(() => checkpoint.execute('invented', { ...params, evidence: [{ ...reviewedEvidence, quizId: 'invented' }] }, undefined, undefined, ctx), /not a real, correct submitted attempt/);
  await assert.rejects(() => checkpoint.execute('unsound', { ...params, evidence: [{ ...reviewedEvidence, reasoningSound: false }] }, undefined, undefined, ctx), /honest evaluation/);
  assert.equal(fs.existsSync(path.join(vault, '.learning/progress.json')), false, 'Rejected claims must not save progress');
  for (const [id, details] of [['wrong', { status: 'answered', correct: false }], ['cancelled', { status: 'cancelled', correct: true }], ['unknown', { status: 'answered', correct: true, dontKnow: true }]]) {
    entries.push({ type: 'message', id, message: { role: 'toolResult', toolName: 'quiz', toolCallId: id, isError: false, details: { ...details, question: 'Synthetic evidence rejection fixture' } } });
    await assert.rejects(() => checkpoint.execute(id, { ...params, evidence: [{ ...reviewedEvidence, quizId: id }] }, undefined, undefined, ctx), /not a real, correct submitted attempt/);
  }
  const cycle = { goalNode: 'chain', nodes: lessonPlan.nodes.map(node => node.id === 'inner' ? { ...node, dependsOn: ['chain'] } : node) };
  await assert.rejects(() => checkpoint.execute('cycle', { ...params, lessonPlan: cycle }, undefined, undefined, ctx), /cycle/);
  await assert.rejects(() => checkpoint.execute('unconfirmed', { ...params, lessonPlan: { ...lessonPlan, nodes: lessonPlan.nodes.map(node => node.id === 'inner' ? { ...node, status: 'pending' } : node) } }, undefined, undefined, ctx), /prerequisites/);
  await assert.rejects(() => checkpoint.execute('false-gap', { ...params, frontier: [{ strand: 'Composition', gap: 'Supposed failure', gapQuizId: reviewedEvidence.quizId }] }, undefined, undefined, ctx), /submitted miss/);
  const saved = await checkpoint.execute('test', params, undefined, undefined, ctx);
  assert.ok(fs.readFileSync(path.join(vault, saved.details.note), 'utf8').includes('Unconfirmed transfer'));
  await commands.get('review').handler('', ctx);
  await tools.get('learning_runtime').definition.execute('resume-review', { action: 'begin', topic: params.topic, goal: params.goal }, undefined, undefined, ctx);
  assert.ok(sent.at(-1).content.includes(saved.details.note));
  assert.ok(sent.at(-1).content.includes('Do not show summaries or solutions'));
  const map = fs.readFileSync(path.join(vault, 'Lesson Map.md'), 'utf8');
  assert.ok(map.includes('inner --> chain') && map.includes('class inner confirmed') && map.includes('class chain current'));
  assert.ok(map.includes('Changed-example transfer is not tested yet.') && !map.includes('Supposed failure'));
  await commands.get('map').handler('', ctx);
  assert.ok(notices.at(-1).text.includes('1/2 steps checked') && notices.at(-1).text.includes('Current: Track nested rates'));
  const updated = await checkpoint.execute('test', { ...params, nextStep: 'New next step' }, undefined, undefined, ctx);
  assert.equal(fs.readdirSync(path.join(vault, 'Checkpoints')).filter(file => file.endsWith('.md')).length, 1, 'Update the same current topic');
  const earlier = fs.readFileSync(path.join(vault, updated.details.previousNote), 'utf8');
  assert.ok(earlier.includes('Try a changed nested example') && earlier.includes('Test fixture only'), 'Keep earlier attempts and their original sources');
  assert.ok(fs.readFileSync(path.join(vault, updated.details.note), 'utf8').includes(updated.details.previousNote.slice(0, -3)), 'Link the earlier checkpoint from the current note');
  entries = [];
  const { evidence: _evidence, lessonPlan: _plan, frontier: _frontier, ...unchanged } = params;
  const carried = await checkpoint.execute('resume', { ...unchanged, nextStep: 'Resume the agreed rate step' }, undefined, undefined, ctx);
  const state = Object.values(JSON.parse(fs.readFileSync(path.join(vault, '.learning/progress.json'), 'utf8')))[0];
  assert.deepEqual(state.lessonPlan, lessonPlan, 'Preserve the agreed map across sessions without re-testing earlier evidence');
  assert.deepEqual(state.frontier, params.frontier);
  assert.ok(fs.readFileSync(path.join(vault, carried.details.note), 'utf8').includes('inner --> chain'));
  await checkpoint.execute('unchanged-explicit-map', { ...unchanged,
    lessonPlan: { nodes: lessonPlan.nodes.map(node => ({ status: node.status, label: node.label, quizId: node.quizId, dependsOn: [...node.dependsOn], id: node.id })), goalNode: lessonPlan.goalNode },
    frontier: params.frontier.map(item => ({ uncertainty: item.uncertainty, floorQuizId: item.floorQuizId, floor: item.floor, strand: item.strand })),
  }, undefined, undefined, ctx);
  await assert.rejects(() => checkpoint.execute('invented-node', { ...unchanged,
    lessonPlan: { ...lessonPlan, nodes: lessonPlan.nodes.map(node => node.id === 'chain' ? { ...node, status: 'confirmed', quizId: 'invented' } : node) },
  }, undefined, undefined, ctx), /not a real, correct submitted attempt|newly confirmed node needs direct plus fresh transfer/);
  await tools.get('learning_runtime').definition.execute('new-scope', { action: 'begin', topic: params.topic, goal: 'A different agreed scope', strands: [{ id: 'rates', label: 'Rates', scope: 'The new explicitly requested rate goal', maxDifficulty: 5 }] }, undefined, undefined, ctx);
  await checkpoint.execute('changed-scope', { ...unchanged, goal: 'A different agreed scope' }, undefined, undefined, ctx);
  assert.ok(!fs.readFileSync(path.join(vault, 'Lesson Map.md'), 'utf8').includes('```mermaid'), 'Do not show the old current node as the map of a changed goal');
  console.log('New checkpoint claims reject fabricated, cancelled, wrong and unsound evidence; maps and frontiers persist across sessions.');
  await assert.rejects(() => checkpoint.execute('bad', { ...params, reviewOn: '2026-02-30' }, undefined, undefined, ctx));
  await commands.get('learn').handler('inverse functions', ctx);
  assert.equal(sent.at(-1).content, '/skill:teach inverse functions');
  assert.equal(sent.at(-1).options.expandPromptTemplates, true);
  await commands.get('wrap-up').handler('', ctx);
  assert.ok(sent.at(-1).content.includes('Stop after saving'));
  ctx.isIdle = () => false;
  const count = sent.length;
  await commands.get('review').handler('', ctx);
  assert.equal(sent.length, count, 'Do not interrupt an active quiz');
  assert.ok(!notices.some(notice => notice.level === 'error'), JSON.stringify(notices));
  console.log('Automatic logging, reload, unlog, answer privacy, checkpoints, review and commands passed.');

  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 18 Tf 20 120 Td (Calculus material test) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdfFile = path.join(scratch, 'material.pdf'); fs.writeFileSync(pdfFile, pdf);
  const material = tools.get('read_class_material').definition;
  const result = await material.execute('pdf', { path: pdfFile }, undefined, undefined, ctx);
  assert.ok(result.content[0].text.includes('Calculus material test'));
  const page = await material.execute('png', { path: pdfFile, renderPage: 1 }, undefined, undefined, ctx);
  assert.equal(Buffer.from(page.content[1].data, 'base64').subarray(1, 4).toString(), 'PNG');
  await assert.rejects(() => material.execute('page', { path: pdfFile, renderPage: 2 }, undefined, undefined, ctx));
  const docx = path.join(scratch, 'material.docx');
  execFileSync('python3', ['-c', 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("word/document.xml",\'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX class notes test</w:t></w:r></w:p></w:body></w:document>\')', docx]);
  const word = await material.execute('docx', { path: docx }, undefined, undefined, ctx);
  assert.ok(word.content[0].text.includes('DOCX class notes test'));
  console.log('PDF text, original page image, page bounds and DOCX extraction passed.');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
