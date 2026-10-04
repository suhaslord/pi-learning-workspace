import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export interface LearningEvidence {
	quizId: string;
	understanding: string;
	reasoningSound: boolean;
	review: string;
}

export interface Frontier {
	strand: string;
	floor?: string;
	floorQuizId?: string;
	gap?: string;
	gapQuizId?: string;
	uncertainty?: string;
}

export interface LessonPlan {
	goalNode: string;
	nodes: Array<{
		id: string;
		label: string;
		dependsOn: string[];
		status: "pending" | "current" | "confirmed";
		quizId?: string;
	}>;
}

function attempt(branch: SessionEntry[], id: string) {
	const entry = [...branch].reverse().find(entry => entry.type === "message" && entry.message.role === "toolResult"
		&& entry.message.toolName === "quiz" && entry.message.toolCallId === id && !entry.message.isError);
	if (!entry || entry.type !== "message" || entry.message.role !== "toolResult") return undefined;
	return entry.message.details as { status?: string; correct?: boolean; dontKnow?: boolean; question?: string; note?: string } | undefined;
}

function correctAttempt(branch: SessionEntry[], id: string): void {
	const result = attempt(branch, id);
	if (!result || result.status !== "answered" || result.correct !== true || result.dontKnow || !result.question) {
		throw new Error(`Quiz ${id} is not a real, correct submitted attempt on this session branch.`);
	}
}

export function validateLearningEvidence(branch: SessionEntry[], claims: string[], evidence: LearningEvidence[], previousClaims: string[]): void {
	for (const item of evidence) {
		correctAttempt(branch, item.quizId);
		if (!item.reasoningSound || item.review.trim().length < 12) throw new Error(`Quiz ${item.quizId} needs an honest evaluation of the learner's reasoning.`);
	}
	for (const claim of claims) {
		if (!claim.trim()) throw new Error("Demonstrated understanding cannot contain an empty claim.");
		if (previousClaims.some(previous => previous.trim() === claim.trim())) continue;
		if (!evidence.some(item => item.understanding.trim() === claim.trim())) {
			throw new Error(`New understanding needs evidence with the same claim and an actual quiz toolCallId: ${claim}`);
		}
	}
}

export function validateFrontier(branch: SessionEntry[], frontier: Frontier[], evidence: LearningEvidence[], previous: Frontier[] = []): void {
	for (const strand of frontier) {
		if (previous.some(item => item.strand === strand.strand && item.floor === strand.floor && item.floorQuizId === strand.floorQuizId
			&& item.gap === strand.gap && item.gapQuizId === strand.gapQuizId && item.uncertainty === strand.uncertainty)) continue;
		if (strand.floor || strand.floorQuizId) {
			if (!strand.floor || !strand.floorQuizId) throw new Error("A demonstrated floor needs both its description and quizId.");
			correctAttempt(branch, strand.floorQuizId);
			if (!evidence.some(item => item.quizId === strand.floorQuizId && item.reasoningSound)) throw new Error("A frontier floor needs reviewed quiz evidence, not just a correct choice.");
		}
		if (strand.gapQuizId) {
			const result = attempt(branch, strand.gapQuizId);
			if (!strand.gap || !result || result.status !== "answered" || !(result.correct === false || result.dontKnow)) {
				throw new Error("A tested gap needs a real submitted miss or I-don't-know attempt.");
			}
		}
		if (!strand.floor && !strand.gap && !strand.uncertainty) throw new Error("Describe the strand's observed knowledge, gap, or remaining uncertainty.");
		if (strand.gap && !strand.gapQuizId && !strand.uncertainty) throw new Error("Mark an untested suspected gap as uncertainty; do not invent a failed attempt.");
	}
}

export function validateLessonPlan(branch: SessionEntry[], plan: LessonPlan, evidence: LearningEvidence[], previous?: LessonPlan): void {
	const nodes = new Map(plan.nodes.map(node => [node.id, node]));
	if (!plan.nodes.length || nodes.size !== plan.nodes.length || !nodes.has(plan.goalNode)) throw new Error("The lesson map needs unique nodes and an existing goal node.");
	if (plan.nodes.filter(node => node.status === "current").length > 1) throw new Error("Teach only one current lesson node at a time.");
	const visited = new Set<string>();
	const visiting = new Set<string>();
	function visit(id: string): void {
		if (visiting.has(id)) throw new Error("The lesson dependency map contains a cycle.");
		if (visited.has(id)) return;
		const node = nodes.get(id);
		if (!node) throw new Error(`Unknown lesson prerequisite: ${id}`);
		visiting.add(id);
		for (const dependency of node.dependsOn) visit(dependency);
		visiting.delete(id); visited.add(id);
	}
	visit(plan.goalNode);
	if (visited.size !== nodes.size) throw new Error("Every lesson node must lead to the agreed goal; remove unrelated branches.");
	for (const node of plan.nodes) {
		if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(node.id)) throw new Error("Node IDs must be simple identifiers starting with a letter.");
		if (new Set(node.dependsOn).size !== node.dependsOn.length) throw new Error("Do not duplicate prerequisite edges.");
		if (node.status !== "pending" && node.dependsOn.some(id => nodes.get(id)?.status !== "confirmed")) throw new Error(`Confirm ${node.label}'s prerequisites before advancing.`);
		if (node.status === "confirmed") {
			const old = previous?.nodes.find(item => item.id === node.id);
			if (old && old.status === "confirmed" && old.label === node.label && old.quizId === node.quizId
				&& old.dependsOn.length === node.dependsOn.length && old.dependsOn.every(id => node.dependsOn.includes(id))) continue;
			if (!node.quizId) throw new Error(`A confirmed node needs its actual quizId: ${node.label}`);
			correctAttempt(branch, node.quizId);
			if (!evidence.some(item => item.quizId === node.quizId && item.reasoningSound)) throw new Error(`Review the learner's evidence before confirming ${node.label}.`);
		}
	}
}

export function renderLessonPlan(plan: LessonPlan): string {
	const label = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]+/g, " ");
	const lines = plan.nodes.map(node => `  ${node.id}["${label(node.label)}"]`);
	for (const node of plan.nodes) for (const dependency of node.dependsOn) lines.push(`  ${dependency} --> ${node.id}`);
	lines.push("  classDef confirmed fill:#203d2b,stroke:#64c884,color:#ffffff", "  classDef current fill:#3d3420,stroke:#e7b658,color:#ffffff");
	for (const node of plan.nodes) if (node.status !== "pending") lines.push(`  class ${node.id} ${node.status}`);
	const current = plan.nodes.find(node => node.status === "current");
	return `## Lesson path\n\nGreen = checked; gold = current; unmarked = pending.\n\n\`\`\`mermaid\ngraph TD\n${lines.join("\n")}\n\`\`\`\n\nCurrent step: ${current?.label ?? (plan.nodes.every(node => node.status === "confirmed") ? "All mapped steps checked." : "Awaiting the next agreed step.")}\n`;
}
