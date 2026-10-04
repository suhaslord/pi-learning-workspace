import { normalizeLatexSource } from "./latex-source.ts";

type Fraction = [bigint, bigint];
type Polynomial = Map<string, Fraction>;
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a < 0n ? -a : a;
function fraction(n: bigint, d = 1n): Fraction {
	if (!d) throw new Error("Zero denominator");
	const divisor = gcd(n, d);
	return [n / divisor * (d < 0n ? -1n : 1n), (d < 0n ? -d : d) / divisor];
}
const constant = (value: Fraction): Polynomial => new Map(value[0] ? [["", value]] : []);
const polynomialSignature = (value: Polynomial): string => JSON.stringify([...value].sort(([a], [b]) => a.localeCompare(b)).map(([key, [n, d]]) => [key, String(n), String(d)]));
function add(a: Polynomial, b: Polynomial, sign = 1n): Polynomial {
	const result = new Map(a);
	for (const [key, value] of b) {
		const previous = result.get(key) ?? [0n, 1n];
		const next = fraction(previous[0] * value[1] + sign * value[0] * previous[1], previous[1] * value[1]);
		if (next[0]) result.set(key, next); else result.delete(key);
	}
	return result;
}

// Exact, bounded polynomial arithmetic, including identical sin/cos/exp factors.
// Unsupported notation is left unverified;
// numerical sampling never decides whether two quiz choices are equivalent.
export function polynomialKey(label: string): string | undefined {
	try {
		const source = normalizeLatexSource(label).trim();
		const math = /^\$([^$]+)\$$/.exec(source)?.[1] ?? /^\\\(([\s\S]+)\\\)$/.exec(source)?.[1];
		if (!math || math.length > 500) return;
		const text = math.replace(/\\(?:left|right)(?![a-zA-Z])/g, "").replace(/\\(?:cdot|times)(?![a-zA-Z])/g, "*").replace(/\\[,!;: ]/g, "").replace(/−/g, "-").replace(/\s+/g, "");
		const tokens = text.match(/\\(?:frac|sin|cos|exp)|\d+(?:\.\d+)?|[a-zA-Z()+\-*/^{}]/g) ?? [];
		if (tokens.join("") !== text || tokens.length > 200) return;
		let index = 0;
		let operations = 0;
		const multiply = (a: Polynomial, b: Polynomial): Polynomial => {
			let result: Polynomial = new Map();
			for (const [left, x] of a) for (const [right, y] of b) {
				const factors = [...(left ? left.split("\0") : []), ...(right ? right.split("\0") : [])];
				if (++operations > 10000 || factors.length > 64) throw new Error("Polynomial limit");
				const key = factors.sort().join("\0");
				result = add(result, new Map([[key, fraction(x[0] * y[0], x[1] * y[1])]]));
				if (result.size > 256) throw new Error("Polynomial limit");
			}
			return result;
		};
		const divide = (a: Polynomial, b: Polynomial): Polynomial => {
			const divisor = b.get("");
			if (b.size !== 1 || !divisor?.[0]) throw new Error("Nonconstant denominator");
			return multiply(a, constant(fraction(divisor[1], divisor[0])));
		};
		function atom(): Polynomial {
			const token = tokens[index++];
			if (token === "(" || token === "{") {
				const result = expression();
				if (tokens[index++] !== (token === "(" ? ")" : "}")) throw new Error("Unclosed group");
				return result;
			}
			if (token === "\\frac") {
				if (tokens[index] !== "{") throw new Error("Fraction group required");
				const numerator = atom();
				if (tokens[index] !== "{") throw new Error("Fraction group required");
				return divide(numerator, atom());
			}
			if (/^\\(?:sin|cos|exp)$/.test(token ?? "")) {
				if (tokens[index] !== "(" && tokens[index] !== "{") throw new Error("Explicit function argument required");
				const argument = atom();
				return new Map([[token + ":" + polynomialSignature(argument), [1n, 1n]]]);
			}
			if (/^[xytuvabcnrz]$/.test(token ?? "")) return new Map([[token, [1n, 1n]]]);
			if (/^\d+(?:\.\d+)?$/.test(token ?? "") && token.length <= 50) {
				const digits = token.split(".");
				return constant(fraction(BigInt(digits.join("")), 10n ** BigInt(digits[1]?.length ?? 0)));
			}
			throw new Error("Unsupported atom");
		}
		function factor(): Polynomial {
			if (tokens[index] === "+") { index++; return factor(); }
			if (tokens[index] === "-") { index++; return multiply(constant([-1n, 1n]), factor()); }
			let result = atom();
			if (tokens[index] === "^") {
				index++;
				const exponent = atom();
				const value = exponent.size ? exponent.get("") : [0n, 1n];
				if (exponent.size > 1 || !value || value[1] !== 1n || value[0] < 0n || value[0] > 12n) throw new Error("Unsupported exponent");
				const base = result;
				result = constant([1n, 1n]);
				for (let power = 0n; power < value[0]; power++) result = multiply(result, base);
			}
			return result;
		}
		function product(): Polynomial {
			let result = factor();
			while (index < tokens.length) {
				const next = tokens[index];
				if (next === "*" || next === "/") { index++; result = next === "*" ? multiply(result, factor()) : divide(result, factor()); }
				else if (/^(?:[a-zA-Z]|\d|\(|\{|\\(?:frac|sin|cos|exp))/.test(next)) result = multiply(result, factor());
				else break;
			}
			return result;
		}
		function expression(): Polynomial {
			let result = product();
			while (tokens[index] === "+" || tokens[index] === "-") { const sign = tokens[index++] === "+" ? 1n : -1n; result = add(result, product(), sign); }
			return result;
		}
		const result = expression();
		if (index !== tokens.length) return;
		return polynomialSignature(result);
	} catch { return; }
}

export function equivalentPolynomialOptions(labels: string[]): [number, number] | undefined {
	const seen = new Map<string, number>();
	for (let index = 0; index < labels.length; index++) {
		const key = polynomialKey(labels[index]);
		if (key === undefined) continue;
		const previous = seen.get(key);
		if (previous !== undefined) return [previous, index];
		seen.set(key, index);
	}
}
