import { createRequire } from "node:module";
import { Text, visibleWidth } from "@mariozechner/pi-tui";
import { normalizeLatexSource } from "./latex-source.ts";

interface MathNode {
  nodeType: number;
  localName: string;
  textContent: string | null;
  childNodes: ArrayLike<MathNode>;
  previousSibling: MathNode | null;
}

const katex = createRequire(new URL("../visual-tools/package.json", import.meta.url))("katex") as {
  renderToString(source: string, options: Record<string, unknown>): string;
};
const { DOMParser } = createRequire(new URL("../../../work/runtime/pi/package.json", import.meta.url))("linkedom") as {
  DOMParser: new () => { parseFromString(source: string, type: string): { querySelector(selector: string): MathNode | null } };
};

const superscripts = new Map(Array.from("0123456789+-=()in′″‴").map((c, i) => [c, Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ′″‴")[i]]));
const subscripts = new Map(Array.from("0123456789+-=()aehijklmnoprstuvx").map((c, i) => [c, Array.from("₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ")[i]]));
const fractions = new Map(Object.entries({
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾",
  "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘", "1/6": "⅙", "5/6": "⅚",
  "1/7": "⅐", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞", "1/9": "⅑", "1/10": "⅒",
}));

interface MathBox {
  lines: string[];
  width: number;
  baseline: number;
}

interface FormatOptions {
  displayBlocks?: boolean;
  maxWidth?: number;
}

const cache = new Map<string, { text: string; box: MathBox }>();

function childNodes(node: MathNode): MathNode[] {
  return Array.from(node.childNodes).filter(child => child.nodeType === 1 || child.nodeType === 3);
}

function fractionTerm(node: MathNode, denominator = false): string {
  const text = linearize(node).trim();
  if (["mi", "mn", "msup", "msub", "msubsup", "msqrt", "mroot"].includes(node.localName)) return text;
  const children = childNodes(node);
  if (children.length === 1) return fractionTerm(children[0], denominator);
  if (text.startsWith("(") && text.endsWith(")")) return text;
  if (denominator) return `(${text})`;
  let depth = 0;
  for (const char of text) {
    if ("([{".includes(char)) depth++;
    if (")]}".includes(char)) depth--;
    if (!depth && "+−±∓/=<>≤≥".includes(char)) return `(${text})`;
  }
  return text;
}

function script(text: string, upper: boolean): string {
  const mapping = upper ? superscripts : subscripts;
  const chars = Array.from(text.replace(/\s+/g, ""));
  if (chars.length && chars.every(c => mapping.has(c))) return chars.map(c => mapping.get(c)).join("");
  return `${upper ? "^" : "_"}(${text})`;
}

function linearize(node: MathNode): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/[\u2061\u2062]/g, "");
  const children = childNodes(node);
  const parts = () => children.map(linearize);
  const base = () => {
    const text = linearize(children[0]);
    return children[0].localName === "mrow" && /[+−=]/.test(text) && !text.startsWith("(") ? `(${text})` : text;
  };
  switch (node.localName) {
    case "annotation": return "";
    case "mspace": return " ";
    case "msup": return base() + script(linearize(children[1]), true);
    case "msub": return base() === "lim" ? `lim[${linearize(children[1]).trim()}]` : base() + script(linearize(children[1]), false);
    case "msubsup": return base() + script(linearize(children[1]), false) + script(linearize(children[2]), true);
    case "mfrac": {
      const numerator = linearize(children[0]).trim();
      const denominator = linearize(children[1]).trim();
      const fraction = fractions.get(`${numerator}/${denominator}`);
      if (fraction) return fraction;
      if (/^\d{1,3}$/.test(numerator) && /^\d{1,3}$/.test(denominator)) {
        return script(numerator, true) + "⁄" + script(denominator, false);
      }
      return fractionTerm(children[0]) + "/" + fractionTerm(children[1], true);
    }
    case "msqrt": return `√(${parts().join("")})`;
    case "mroot": return `root(${linearize(children[1])}, ${linearize(children[0])})`;
    case "munder": return base() === "lim" ? `lim[${linearize(children[1]).trim()}]` : base() + `_(${linearize(children[1])})`;
    case "mover": return `over(${base()}, ${linearize(children[1])})`;
    case "munderover": return base() + `_(${linearize(children[1])})^(${linearize(children[2])})`;
    case "mtable": return parts().join("; ");
    case "mtr": return `[${parts().join(", ")}]`;
    case "mo": {
      const text = parts().join("").replace(/⋅/g, "·");
      const previous = node.previousSibling;
      if (/^[+−]$/.test(text) && (!previous || previous.localName === "mo" && /^[=([{+−×·]$/.test(previous.textContent ?? ""))) return text;
      return /^[=+−×·∘±∓<>≤≥≈≠→⇒∈]$/.test(text) ? ` ${text} ` : text;
    }
    case "math": case "semantics": case "mrow": case "mi": case "mn":
    case "mtext": case "mstyle": case "mtd": case "mpadded":
      return parts().join("");
    default: throw new Error(`Unsupported math layout: ${node.localName}`);
  }
}

function textBox(text: string): MathBox {
  return { lines: [text], width: visibleWidth(text), baseline: 0 };
}

function center(line: string, width: number): string {
  const padding = Math.max(0, width - visibleWidth(line));
  return " ".repeat(Math.floor(padding / 2)) + line + " ".repeat(Math.ceil(padding / 2));
}

function horizontal(boxes: MathBox[]): MathBox {
  if (!boxes.length) return textBox("");
  const baseline = Math.max(...boxes.map(box => box.baseline));
  const below = Math.max(...boxes.map(box => box.lines.length - box.baseline - 1));
  const lines = Array.from({ length: baseline + below + 1 }, (_, row) => boxes.map(box => {
    const line = box.lines[row - baseline + box.baseline] ?? "";
    return line + " ".repeat(Math.max(0, box.width - visibleWidth(line)));
  }).join(""));
  return { lines, baseline, width: boxes.reduce((width, box) => width + box.width, 0) };
}

function layout(node: MathNode): MathBox {
  const children = childNodes(node);
  switch (node.localName) {
    case "mfrac": {
      const numerator = layout(children[0]);
      const denominator = layout(children[1]);
      const width = Math.max(numerator.width, denominator.width) + 2;
      return {
        width, baseline: numerator.lines.length,
        lines: [...numerator.lines.map(line => center(line, width)), "─".repeat(width), ...denominator.lines.map(line => center(line, width))],
      };
    }
    case "msqrt": {
      const body = horizontal(children.map(layout));
      return {
        width: body.width + 2, baseline: body.baseline + 1,
        lines: ["  " + "─".repeat(body.width), ...body.lines.map((line, index) => (index === body.baseline ? "√ " : "│ ") + line)],
      };
    }
    case "msub": case "munder": {
      if (linearize(children[0]) !== "lim") return textBox(linearize(node));
      const base = layout(children[0]);
      const lower = layout(children[1]);
      const width = Math.max(base.width, lower.width);
      return { width, baseline: base.baseline, lines: [...base.lines.map(line => center(line, width)), ...lower.lines.map(line => center(line, width))] };
    }
    case "math": case "semantics": case "mrow": case "mstyle": case "mtd": case "mpadded":
      return horizontal(children.filter(child => child.localName !== "annotation").map(layout));
    default: return textBox(linearize(node));
  }
}

function renderFormula(source: string, original: string, options: FormatOptions, display: boolean): string {
  if (source.length > 4096) return original;
  try {
    let cached = cache.get(source);
    if (!cached) {
      const markup = katex.renderToString(source, { output: "mathml", throwOnError: true, strict: "ignore", trust: false, maxExpand: 100 });
      const math = new DOMParser().parseFromString(markup, "text/html").querySelector("math");
      if (!math) return original;
      cached = { text: linearize(math).replace(/\s+/g, " ").trim(), box: layout(math) };
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(source, cached);
    }
    if (display && options.displayBlocks && cached.box.width <= (options.maxWidth ?? 100)) {
      return "\n```text\n" + cached.box.lines.map(line => line.trimEnd()).join("\n") + "\n```\n";
    }
    return cached.text;
  } catch {
    return original;
  }
}

export function formatMathForTerminal(text: string, options: FormatOptions = {}): string {
  // Code examples remain literal; incomplete formulas stay intact while streaming.
  return normalizeLatexSource(text).split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(/(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g,
      (match, display: string | undefined, inline: string | undefined, parens: string | undefined, brackets: string | undefined) =>
        renderFormula(display ?? inline ?? parens ?? brackets ?? "", match, options, display !== undefined || brackets !== undefined));
  }).join("");
}

export class MathText extends Text {
  constructor(text = "", paddingX?: number, paddingY?: number, customBgFn?: (text: string) => string) {
    super(formatMathForTerminal(text), paddingX, paddingY, customBgFn);
  }
  setText(text: string): void {
    super.setText(formatMathForTerminal(text));
  }
}
