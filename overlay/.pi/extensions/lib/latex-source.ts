function repairCommands(formula: string): string {
	const commands: [RegExp, string][] = [
		[/\u000c(?=rac\b|orall\b)/g, "\\f"],
		[/\u0008(?=eta\b|ar\b|egin\b|inom\b|oldsymbol\b)/g, "\\b"],
		[/\t(?=ext\b|heta\b|imes\b|an\b|au\b|o\b|frac\b|herefore\b|ilde\b)/g, "\\t"],
		[/\r(?=ight\b|ightarrow\b|ho\b|angle\b|vert\b|floor\b|ceil\b)/g, "\\r"],
	];
	return commands.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), formula);
}

export function normalizeLatexSource(text: string): string {
	return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part.replace(
		/(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$(?!\$)([\s\S]+?)\$(?!\d)|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g,
		(match, display: string | undefined, inline: string | undefined, parens: string | undefined, brackets: string | undefined) => {
			const formula = display ?? inline ?? parens ?? brackets ?? "";
			const repaired = repairCommands(formula);
			return match.replace(formula, () => repaired);
		},
	)).join("");
}

export function malformedMathEscape(text: string): boolean {
	const normalized = normalizeLatexSource(text);
	const parts = normalized.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g);
	for (let index = 0; index < parts.length; index += 2) {
		const formulas = parts[index].matchAll(/(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$(?!\$)([\s\S]+?)\$(?!\d)|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g);
		for (const match of formulas) {
			const formula = match[1] ?? match[2] ?? match[3] ?? match[4];
			if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|\\u[0-9a-f]{4}/i.test(formula)) return true;
			if (/\\\\(?=[a-z])/i.test(formula) && !/\\begin\{(?:aligned|alignedat|gathered|matrix|[bBpPvV]matrix|smallmatrix|cases|array)\}/.test(formula)) return true;
		}
	}
	return false;
}
