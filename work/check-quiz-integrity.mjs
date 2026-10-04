import assert from 'node:assert/strict';
import path from 'node:path';
import { polynomialKey, equivalentPolynomialOptions } from '../.pi/extensions/lib/polynomial-options.ts';
import { loadExtensions } from './runtime/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js';
const pairs = [
 [String.raw`$30x(3x^2+4)^4$`, String.raw`$5(6x)(3x^2+4)^4$`],
 ['$2(x^2-4)(2x)$','$4x(x^2-4)$'],
 ['$(x+1)^2$','$x^2+2x+1$'],
 [String.raw`$\frac{x^2}{2}+0.5x^2$`,'$x^2$'],
 ['$-x^2$','$-(x^2)$'],
 ['$x-x$','$0$'],
 ['$2uv$','$u(2v)$'],
 ['$x^{2+1}$','$x^3$'],
];
for (const [a,b] of pairs) { assert.notEqual(polynomialKey(a),undefined,a); assert.equal(polynomialKey(a),polynomialKey(b),`${a} = ${b}`); }
for (const [a,b] of [['$x^2$','$x^3$'],['$(x+1)^2$','$x^2+1$'],['$2u$','$2x$'],['$0.1x$','$0.1000001x$'],['$-x^2$','$(-x)^2$']]) assert.notEqual(polynomialKey(a),polynomialKey(b));
for (const unsupported of ['$g(x)$','$x^{-1}$','$x/x$','$x^99999$','$x^u$','$x^(2$','At $x$','plain prose',String.raw`$\sqrt{x}$`]) assert.equal(polynomialKey(unsupported),undefined,unsupported);
assert.deepEqual(equivalentPolynomialOptions(pairs[0]),[0,1]);
const root = process.cwd();
const loaded = await loadExtensions([path.join(root,'.pi/extensions/quiz.ts')], root);
assert.deepEqual(loaded.errors,[]);
const quiz = loaded.extensions[0].tools.get('quiz').definition;
let published = false;
const result = await quiz.execute('ambiguous', {
 question:'Derivative?', options:[{label:pairs[0][0],value:'a'},{label:pairs[0][1],value:'b'},{label:'$x$',value:'c'}], correctAnswer:'a', explanation:'PRIVATE FEEDBACK'
}, undefined,()=>published=true,{hasUI:true,ui:{custom:()=>assert.fail('Ambiguous quiz was displayed')}});
assert.equal(result.isError,true);
assert.equal(result.details.status,'unavailable');
assert.equal(published,false,'No pending question is logged before validation');
assert.ok(!JSON.stringify(result).includes('PRIVATE FEEDBACK'),'No feedback leaked before a student attempt');
console.log('Exact polynomial equivalence, distinct choices, unsupported notation, bounded parsing, and blocking ambiguous quizzes before UI/logging passed.');
import { malformedMathEscape } from '../.pi/extensions/lib/latex-source.ts';
for (const text of [String.raw`$\u0006x$`,String.raw`$\\frac{x}{2}$`,'$'+String.fromCharCode(6)+'x$']) assert.equal(malformedMathEscape(text),true,text);
for (const text of [String.raw`$\Delta x$`,String.raw`$\frac{x}{2}$`,String.raw`$\begin{aligned}a&=b\\c&=d\end{aligned}$`,'$'+String.fromCharCode(12)+'rac{1}{2}$']) assert.equal(malformedMathEscape(text),false,text);
const malformed = await quiz.execute('bad-escape',{question:String.raw`What is $\u0006x$?`,options:[{label:'$1$',value:'a'},{label:'$2$',value:'b'}],correctAnswer:'a',explanation:'PRIVATE FEEDBACK'},undefined,()=>assert.fail('Malformed math was published'),{hasUI:true,ui:{custom:()=>assert.fail('Malformed math was displayed')}});
assert.equal(malformed.isError,true);
assert.ok(!JSON.stringify(malformed).includes('PRIVATE FEEDBACK'));
console.log('Malformed Unicode/control and double-escaped math is blocked; valid LaTeX, repaired fractions and aligned equations pass.');
assert.equal(malformedMathEscape('Literal code: `'+String.raw`$\u0006x$`+'`'),false,'Code examples stay literal');
assert.equal(polynomialKey(String.raw`$\cos((2x^2+1)^3)3(2x^2+1)^2(4x)$`),polynomialKey(String.raw`$\cos((2x^2+1)^3)12x(2x^2+1)^2$`));
assert.notEqual(polynomialKey(String.raw`$\cos((2x^2+1)^3)\cdot3(2x^2+1)^2\cdot4x$`),undefined);
assert.equal(polynomialKey(String.raw`$\cos((2x^2+1)^3)\cdot3(2x^2+1)^2\cdot4x$`),polynomialKey(String.raw`$\cos((2x^2+1)^3)\cdot6(2x^2+1)^2\cdot2x$`));
assert.equal(polynomialKey(String.raw`$\sin(x)\times6x$`),polynomialKey(String.raw`$3x\sin(x)\cdot2$`));
assert.notEqual(polynomialKey(String.raw`$\cos(x)3x$`),polynomialKey(String.raw`$\cos(2x)3x$`));
assert.notEqual(polynomialKey(String.raw`$\cos(x)3x$`),polynomialKey(String.raw`$\sin(x)3x$`));
assert.notEqual(polynomialKey(String.raw`$\cos(x)+3x$`),undefined);
assert.equal(polynomialKey(String.raw`$\tan(x)$`),undefined);
assert.equal(polynomialKey(String.raw`$\sin x$`),undefined);
console.log('Equivalent coefficients around identical sin/cos/exp factors are detected exactly; different functions or arguments remain distinct.');
const trigDuplicate = await quiz.execute('trig-ambiguous', {question:'Derivative?',options:[
 {label:String.raw`$\cos((2x^2+1)^3)\cdot3(2x^2+1)^2\cdot4x$`,value:'a'},
 {label:String.raw`$\cos((2x^2+1)^3)\cdot6(2x^2+1)^2\cdot2x$`,value:'b'},
 {label:'$x$',value:'c'}],correctAnswer:'a',explanation:'PRIVATE FEEDBACK'
},undefined,()=>assert.fail('Equivalent trig options were published'),{hasUI:true,ui:{custom:()=>assert.fail('Equivalent trig options were displayed')}});
assert.equal(trigDuplicate.isError,true);
assert.ok(trigDuplicate.content[0].text.includes('algebraically equivalent'));
