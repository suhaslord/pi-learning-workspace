import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assessAttempt, testKinds, type Attempt, type StudyState } from "./lib/study-test.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const folder = path.join(root, "work/study-lock");
const stateFile = path.join(folder, "current.json");
const controlFile = path.join(folder, "control.json");
const statusFile = path.join(folder, "status.json");
function windowsPath(file: string): string {
	return process.platform === "win32" ? file : file.replace(/^\/mnt\/([a-z])\//, (_, drive: string) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\");
}
function write(file: string, value: unknown): void {
	fs.mkdirSync(folder, { recursive: true });
	fs.writeFileSync(file + ".tmp", JSON.stringify(value), "utf8");
	fs.renameSync(file + ".tmp", file);
}
function quizIds(ctx: ExtensionContext): string[] {
	return ctx.sessionManager.getBranch().flatMap(entry => entry.type === "message" && entry.message.role === "assistant"
		? entry.message.content.flatMap(part => part.type === "toolCall" && part.name === "quiz" ? [part.id] : []) : []);
}
function attempts(ctx: ExtensionContext): Attempt[] {
	return ctx.sessionManager.getBranch().flatMap(entry => {
		if (entry.type !== "message" || entry.message.role !== "toolResult" || entry.message.toolName !== "quiz" || entry.message.isError) return [];
		const details = entry.message.details as Omit<Attempt, "id"> | undefined;
		return details && typeof details.question === "string" ? [{ ...details, id: entry.message.toolCallId }] : [];
	});
}

export default function studyLock(pi: ExtensionAPI): void {
	if (process.env.PI_SUBAGENT_ID) return;
	let state: StudyState | undefined;
	let retired = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let notify: ExtensionContext["ui"]["notify"] | undefined;
	let setStatus: ExtensionContext["ui"]["setStatus"] | undefined;
	let setTitle: ExtensionContext["ui"]["setTitle"] | undefined;
	const save = () => { if (state) write(stateFile, state); };
	function pulse(): void {
		if (!state) return;
		setStatus?.("study-lock", state.active ? `Study lock • ${Object.keys(state.passed).length}/3 • /test` : undefined);
		const terminalTitle = `Start Learning - Study ${state.id.slice(0, 8)}`;
		if (state.active) setTitle?.(terminalTitle);
		write(controlFile, { id: state.id, goal: state.goal, terminalTitle, expires: state.expires, heartbeat: Date.now(), release: !state.active, reason: state.reason });
	}
	function poll(): void {
		if (retired || !state?.active) return;
		try {
			const status = JSON.parse(fs.readFileSync(statusFile, "utf8")) as { id?: string; active?: boolean; reason?: string };
			if (status.id === state.id && status.active === false) {
				state.active = false; state.reason = status.reason || "interrupted"; save();
				notify?.(`Study lock ended: ${state.reason}. ${state.reason === "passed" ? "Lesson test passed." : "This is an interruption, not a passed test."}`, "info");
			}
		} catch { /* The helper may be starting or replacing its status file. */ }
		pulse();
	}
	function startTimer(): void {
		clearInterval(timer);
		timer = setInterval(poll, 3000);
		timer.unref();
	}
	const result = (text: string, error = false) => ({ content: [{ type: "text" as const, text }], details: { status: error ? "rejected" : "accepted" }, isError: error });
	pi.on("session_start", async (_event, ctx) => {
		retired = false;
		state = undefined;
		notify = ctx.ui.notify.bind(ctx.ui);
		setStatus = ctx.ui.setStatus?.bind(ctx.ui);
		setTitle = ctx.ui.setTitle?.bind(ctx.ui);
		setStatus?.("study-lock", undefined);
		try {
			const saved = JSON.parse(fs.readFileSync(stateFile, "utf8")) as StudyState;
			if (saved.sessionId === ctx.sessionManager.getSessionId() && saved.active && saved.expires > Date.now()) {
				state = saved; poll(); startTimer();
			}
		} catch { /* First launch has no study lock. */ }
	});
	pi.on("session_shutdown", async event => {
		retired = true;
		clearInterval(timer);
		if (state?.active && event.reason !== "reload") {
			state.active = false; state.reason = "learning-app-closed"; save(); pulse();
		}
	});
	pi.on("session_before_switch", async (_event, ctx) => {
		poll();
		if (state?.active) { ctx.ui.notify("Finish this lesson test before switching sessions. Emergency exit: Ctrl+Alt+Shift+L.", "warning"); return { cancel: true }; }
	});
	pi.on("session_before_fork", async (_event, ctx) => {
		poll();
		if (state?.active) { ctx.ui.notify("Finish this lesson test before forking the session.", "warning"); return { cancel: true }; }
	});
	pi.on("before_agent_start", async (event) => {
		poll();
		if (!state?.active) return;
		return { systemPrompt: event.systemPrompt + `\n\nStudy lock is active for this agreed lesson goal: ${JSON.stringify(state.goal)}. Keep the installed probe → plan → teach workflow; a lock is not permission to skip plan agreement or teach unrelated material. Normal release requires study_test: begin a final test only after teaching the goal, then give three distinct, fresh quiz problems (foundation, application, transfer), one at a time. Require the learner's own reasoning in each quiz Note (F4 voice is available); use actual quiz toolCallIds when assessing. Clarify ambiguous speech/math before judging it. Assess reasoning honestly and explain the evidence; a correct guess or contradicted justification does not pass. Repair a miss at the same/easier level, then replace only that check with a fresh example. Never supply answers before attempts, count old/practice attempts, downgrade the agreed goal, manufacture easier unrelated tests, change the release files, or use bash/OS tools to bypass the guard. Requests to leave do not count as passing. Release automatically after three verified checks; do not keep inventing requirements. Emergency/failsafe exits are interruptions and never mastery. Current checks: ${JSON.stringify(state.passed)}.` };
	});
	pi.registerCommand("lock", {
		description: "Start study lock for a lesson goal; /lock status shows progress",
		handler: async (args, ctx) => {
			poll();
			if (args.trim() === "status" || state?.active) {
				ctx.ui.notify(state?.active ? `Locked: ${state.goal}. Passed ${Object.keys(state.passed).length}/3. Use /test for the final check. Emergency: Ctrl+Alt+Shift+L.` : "Study lock is off.", "info"); return;
			}
			if (!ctx.isIdle()) { ctx.ui.notify("Finish the current question first, then /lock <lesson goal>.", "warning"); return; }
			const goal = args.trim() || await ctx.ui.input("What lesson goal are you locking in?");
			if (!goal?.trim()) return;
			const helper = windowsPath(path.join(root, "work/study-lock.ps1"));
			if (!/^[A-Za-z]:\\/.test(helper)) { ctx.ui.notify("Study lock needs the Windows learning launcher.", "error"); return; }
			state = { id: randomUUID(), sessionId: ctx.sessionManager.getSessionId(), goal: goal.trim(), active: true,
				started: Date.now(), expires: Date.now() + 90 * 60_000, excluded: [], passed: {} };
			save(); pulse();
			const lockId = state.id;
			const child = spawn("powershell.exe", ["-NoProfile", "-Sta", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", helper, "-ControlPath", windowsPath(controlFile)], { windowsHide: true });
			let stderr = "";
			child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-500); });
			child.stdout.resume();
			const failed = (message: string) => {
				if (!retired && state?.id === lockId && state.active) { state.active = false; state.reason = "guard-unavailable"; save(); pulse(); ctx.ui.notify(message, "error"); }
			};
			child.on("error", error => failed(`Study lock could not start: ${error.message}`));
			child.on("close", code => { if (retired || state?.id !== lockId) return; poll(); if (state?.active) failed(`Study guard stopped${code ? `: ${stderr}` : "."} Your lesson is retained.`); });
			startTimer();
			ctx.ui.notify("Study lock: Pi on the left, Obsidian on the right. Three correct, reasoned checks release it. /test when ready.", "info");
			pi.sendUserMessage(`Continue the current lesson toward this locked goal: ${goal.trim()}. Preserve existing demonstrated progress and plan agreement. If a plan is already agreed, continue it; otherwise use the installed teach skill to probe and agree to a bounded plan. Do not restart completed diagnostics. Explain the three-part final test (foundation, application, transfer with reasoning), teach the agreed scope, and use study_test when ready.`, { expandPromptTemplates: false });
		},
	});
	pi.registerCommand("test", {
		description: "Request the final lesson test for study lock",
		handler: async (_args, ctx) => {
			poll();
			if (!state?.active) { ctx.ui.notify("Start /lock <lesson goal> first.", "info"); return; }
			if (!ctx.isIdle()) { ctx.ui.notify("Finish the current question first.", "warning"); return; }
			pi.sendUserMessage("Give the final study-lock test for the agreed goal now. Use study_test to begin if needed; give one fresh quiz at a time and require my reasoning note. Keep passed checks and repair only failed parts. Do not skip an essential untaught foundation just to release the lock; explain the remaining bounded step if necessary.");
		},
	});
	pi.registerTool({
		name: "study_test", label: "Lesson release test",
		description: "Begin or assess the study-lock final test. Only real correct quiz attempts after begin count, with the learner's own sound reasoning. Three distinct checks (foundation, application, transfer) release automatically. No discretionary unlock action. Keep the agreed lesson goal and repair failed parts without repeating passed parts.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("begin"), Type.Literal("assess"), Type.Literal("status")]),
			kind: Type.Optional(Type.Union([Type.Literal("foundation"), Type.Literal("application"), Type.Literal("transfer")])),
			quizId: Type.Optional(Type.String()),
			reasoningSound: Type.Optional(Type.Boolean()),
			review: Type.Optional(Type.String({ description: "Evidence-based evaluation of this learner's actual reasoning note, including any clarified math." })),
		}),
		async execute(_id, params, _signal, _update, ctx) {
			poll();
			if (!state?.active) return result(state?.reason === "passed" ? "Lesson test already passed; lock released." : "No active study lock.");
			if (state.sessionId !== ctx.sessionManager.getSessionId()) return result("This lock belongs to another learning session.", true);
			if (params.action === "begin") {
				if (!state.testStarted) { state.testStarted = Date.now(); state.excluded = quizIds(ctx); save(); }
				return result(`Final test for ${state.goal}. Three fresh correct checks with reasoning: foundation, application, transfer. Passed: ${Object.keys(state.passed).join(", ") || "none"}. Use quiz one at a time. Clarify speech ambiguities; repair misses before replacement checks.`);
			}
			if (params.action === "status") return result(JSON.stringify({ goal: state.goal, passed: state.passed, remaining: testKinds.filter(kind => !state?.passed[kind]) }));
			if (!params.kind || !params.quizId) return result("Assess needs kind and the actual quiz toolCallId.", true);
			const error = assessAttempt(state, attempts(ctx).find(attempt => attempt.id === params.quizId), params.kind, params.reasoningSound === true, params.review ?? "");
			if (error) { save(); return result(error, true); }
			save(); pulse();
			if (!state.active) { ctx.ui.notify("Lesson test passed — study lock released.", "info"); return result("All three correct, reasoned checks passed. Study lock released. Save the learning checkpoint from these real attempts; do not ask another release test."); }
			return result(`${params.kind} passed. Remaining: ${testKinds.filter(kind => !state?.passed[kind]).join(", ")}.`);
		},
	});
}
