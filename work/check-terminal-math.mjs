import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadExtensions } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js';
import { Markdown, visibleWidth } from './runtime/pi/node_modules/@earendil-works/pi-tui/dist/index.js';

const paths = ['terminal-math.ts', 'quiz.ts', 'ask-user-question.ts'].map(file => resolve('.pi/extensions', file));
const loaded = await loadExtensions(paths, process.cwd());
assert.deepEqual(loaded.errors, []);
const markdownTransform = loaded.extensions.find(ext => ext.markdownTransformer).markdownTransformer;
const transform = (text, width = 80) => markdownTransform(text, { availableWidth: width, messageType: 'assistant', isStreaming: false });
const cases = [
  [String.raw`For $h(x)=f(g(x))$, evaluate $f'$ at $g(x)$.`, 'For h(x) = f(g(x)), evaluate f′ at g(x).'],
  [String.raw`$(f\circ g)'(x)=f'(g(x))g'(x)$`, '(f ∘ g)′(x) = f′(g(x))g′(x)'],
  [String.raw`$x^2+x_i+\alpha\leq\infty$`, 'x² + xᵢ + α ≤ ∞'],
  [String.raw`$\frac{1}{x+1}$`, '1/(x + 1)'],
  [String.raw`$\sqrt{x^2+1}$`, '√(x² + 1)'],
  [String.raw`$x^{n+1}$`, 'xⁿ⁺¹'],
  [String.raw`$\frac{\frac{a}{b}}{c}$`, '(a/b)/c'],
  [String.raw`\(f'(x)\)`, 'f′(x)'],
  ['$$\nx^2\n$$', '\n```text\nx²\n```\n'],
  [String.raw`$\frac{3}{4}$ and $\frac{1}{3}$`, '¾ and ⅓'],
  [String.raw`$\frac{7}{3}$`, '⁷⁄₃'],
  [String.raw`$\frac{a+b}{2x}$`, '(a + b)/(2x)'],
  [String.raw`$\lim_{x\to\infty}(\sqrt{4x^2+3x}-2x)$`, 'lim[x → ∞](√(4x² + 3x) − 2x)'],
  [String.raw`$+\infty$ and $-3$`, '+∞ and −3'],
  ['A $formula still streaming', 'A $formula still streaming'],
  [String.raw`$\unsupported{x}$`, String.raw`$\unsupported{x}$`],
  ['Prices: $5 and $10', 'Prices: $5 and $10'],
  [String.raw`Literal \$5`, String.raw`Literal \$5`],
  ['`$x^2$`', '`$x^2$`'],
  ['```tex\n$x^2$\n```\n$x^2$', '```tex\n$x^2$\n```\nx²'],
  ['Transfer check: What is $\frac{d}{dx}(x^2-4)^2$? Explain.', 'Transfer check: What is d/(dx)(x² − 4)²? Explain.'],
  ['$\theta + \beta$', 'θ + β'],
  ['$x\to\\infty$', 'x → ∞'],
  ['$\\nu + \rho$', 'ν + ρ'],
  ['\\(x+\nu\\)', 'x + u'],
];
for (const [input, expected] of cases) assert.equal(transform(input), expected, input);
console.log(`Math conversion passed (${cases.length} cases).`);
const stacked = transform(String.raw`$$\frac{3x}{\sqrt{4x^2+3x}+2x}$$`);
assert.ok(stacked.includes('```text'), stacked);
assert.ok(stacked.includes('─'), stacked);
assert.ok(stacked.includes('√ 4x² + 3x'), stacked);
assert.ok(!stacked.includes('/'), stacked);
assert.equal(transform(stacked), stacked);
const narrow = transform(String.raw`$$\frac{3x}{\sqrt{4x^2+3x}+2x}$$`, 12);
assert.ok(!narrow.includes('```text'), narrow);
console.log('Stacked fractions and roots passed, including narrow-terminal fallback.');
const markdownTheme = Object.fromEntries(['heading', 'link', 'linkUrl', 'code', 'codeBlock', 'codeBlockBorder', 'quote', 'quoteBorder', 'hr', 'listBullet', 'bold', 'italic', 'strikethrough', 'underline'].map(name => [name, text => text]));
for (const width of [24, 40, 80]) {
  const source = String.raw`$$\lim_{x\to\infty}\frac{3x}{\sqrt{4x^2+3x}+2x}$$`;
  const rows = new Markdown(transform(source, width), 0, 0, markdownTheme, undefined, { renderLatex: false }).render(width);
  assert.ok(rows.every(row => visibleWidth(row) <= width), rows.join('\n'));
  assert.ok(rows.join('\n').includes('lim'), rows.join('\n'));
}
console.log('Display equations passed in Pi’s Markdown renderer at three widths.');
const theme = { fg: (_color, text) => text, bold: text => text };
for (const ext of loaded.extensions.filter(ext => ext.tools.size)) {
  for (const { definition } of ext.tools.values()) {
    const text = definition.renderCall({ question: String.raw`At which input is $f'$ evaluated?`, options: [{ label: '$g(x)$' }, { label: '$x$' }] }, theme).render(80).join('\n');
    assert.ok(text.includes('f′'), text);
    assert.ok(!text.includes('$'), text);
  }
}
const quiz = loaded.extensions.flatMap(ext => [...ext.tools.values()]).find(tool => tool.definition.name === 'quiz').definition;
const details = { status: 'answered', question: '$h(x)$', mode: 'single-select', answers: [{ label: '$g(x)$', value: 'inner', index: 1 }], options: [{ label: '$g(x)$', index: 1 }], correctIndices: [1], correct: true, explanation: String.raw`$f'(g(x))\cdot g'(x)$` };
const result = quiz.renderResult({ content: [], details }, {}, theme).render(80).join('\n');
assert.ok(result.includes('f′(g(x)) · g′(x)'), result);
assert.ok(!result.includes('$'), result);
assert.equal(details.options[0].label, '$g(x)$');
console.log('Quiz and question transcript rendering passed; original math retained.');
for (const multiSelect of [false, true]) {
  let popup;
  const ctx = {
    hasUI: true,
    ui: {
      custom: async factory => {
        popup = factory({ requestRender() {}, terminal: { rows: 35 } }, theme, {}, () => {});
        return null;
      },
    },
  };
  await quiz.execute('check', {
    question: String.raw`For $h(x)=f(g(x))$, where is $f'$ evaluated?`,
    options: [{ label: '$g(x)$', value: 'inner' }, { label: '$x$', value: 'original' }],
    correctAnswer: 'inner', explanation: '$f\prime(g(x))$', shuffle: false, multiSelect,
  }, undefined, undefined, ctx);
  for (const width of [40, 80]) {
    const rows = popup.render(width);
    const text = rows.join('\n');
    assert.ok(text.includes('h(x) = f(g(x))'), text);
    assert.ok(text.includes('g(x)'), text);
    assert.ok(!text.includes('$'), text);
    assert.ok(!text.includes('Correct!'), text);
  }
}
console.log('Single-select and multi-select quiz popups passed at two terminal widths.');
let repairedPopup;
await quiz.execute('control-escape', {
  question: 'Transfer: What is $\frac{d}{dx}(x^2-4)^2$? Explain your reasoning.',
  options: [{ label: '$2(x^2-4)(2x)$', value: 'chain' }, { label: '$2(x^2-4)$', value: 'outer' }],
  correctAnswer: 'chain', explanation: 'Both rates multiply.', shuffle: false,
}, undefined, undefined, { hasUI: true, ui: { custom: async factory => {
  repairedPopup = factory({ requestRender() {}, terminal: { rows: 35 } }, theme, {}, () => {});
  return null;
} } });
for (const width of [40, 80]) {
  const text = repairedPopup.render(width).join('\n');
  assert.ok(text.includes('d/(dx)') && text.includes('Explain your reasoning.'), text);
  assert.ok(!text.includes('\f') && !text.includes('$'), 'The full question remains visible');
}
console.log('Previously truncated derivative prompt passed in the actual quiz component at both widths.');
