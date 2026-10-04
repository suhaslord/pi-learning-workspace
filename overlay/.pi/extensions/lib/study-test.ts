export const testKinds = ["foundation", "application", "transfer"] as const;
export type TestKind = typeof testKinds[number];
export interface Attempt {
	id: string;
	question: string;
	status?: string;
	correct?: boolean;
	dontKnow?: boolean;
	note?: string;
}
export interface PassedCheck { id: string; question: string; note: string; review: string; }
export interface StudyState {
	id: string;
	sessionId: string;
	goal: string;
	active: boolean;
	started: number;
	expires: number;
	testStarted?: number;
	excluded: string[];
	passed: Partial<Record<TestKind, PassedCheck>>;
	reason?: string;
}

export function assessAttempt(state: StudyState, attempt: Attempt | undefined, kind: TestKind, sound: boolean, review: string): string | undefined {
	if (!state.active || !state.testStarted) return "No active final test. Begin the lesson test first.";
	if (!attempt || state.excluded.includes(attempt.id)) return "Use a real submitted quiz from after this final test began.";
	const fail = (message: string) => { delete state.passed[kind]; return message; };
	if (attempt.status !== "answered" || attempt.correct !== true || attempt.dontKnow) return fail("This check did not pass. Repair the gap and ask a fresh question at the same level.");
	if (!attempt.note?.trim()) return fail("A correct selection needs the learner's reasoning in the Note. Ask a fresh check with an explanation.");
	if (!sound || review.trim().length < 12) return fail("The reasoning is unresolved. Clarify transcribed math or repair the misconception, then ask a fresh check.");
	const normalized = (question: string) => question.trim().replace(/\s+/g, " ").toLowerCase();
	if (Object.values(state.passed).some(check => check?.id === attempt.id || normalized(check!.question) === normalized(attempt.question))) {
		return "This attempt or question already counted. Use a different problem.";
	}
	state.passed[kind] = { id: attempt.id, question: attempt.question, note: attempt.note, review: review.trim() };
	if (testKinds.every(key => state.passed[key])) { state.active = false; state.reason = "passed"; }
	return undefined;
}
