import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

type VoiceEvent = { kind: string; text: string };
type Launch = () => ChildProcessWithoutNullStreams;

function launch(): ChildProcessWithoutNullStreams {
	const localPath = fileURLToPath(new URL("../../../work/voice-notes.py", import.meta.url));
	const windowsPath = process.platform === "win32" ? localPath : localPath.replace(/^\/mnt\/([a-z])\//, (_, drive: string) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\");
	if (process.platform !== "win32" && !/^[A-Z]:\\/.test(windowsPath)) {
		throw new Error("Microphone notes require Windows or the installed WSL learning launcher.");
	}
	const executable = fileURLToPath(new URL("../../../work/runtime/voice/Scripts/python.exe", import.meta.url));
	return spawn(executable, ["-u", windowsPath], { windowsHide: true });
}

// Only accepted text is passed to Pi. No audio files or clipboard changes.
export class VoiceNote {
	private child?: ChildProcessWithoutNullStreams;
	private stopping = false;
	private transcribing = false;
	private disposed = false;
	private timer?: ReturnType<typeof setTimeout>;
	status = "F4 mic • speech stays on this PC • review words/math before answering";

	constructor(private readonly append: (text: string) => void, private readonly refresh: () => void, private readonly start: Launch = launch) {}

	get active(): boolean { return this.child !== undefined; }

	toggle(): void {
		if (this.disposed) return;
		if (this.child) { this.stop(); return; }
		this.stopping = false;
		this.transcribing = false;
		this.status = "Starting microphone… F4 stops";
		try {
			const child = this.start();
			this.child = child;
			let pending = "";
			let reportedError = false;
			let stderr = "";
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (data: string) => { stderr = (stderr + data).slice(-800); });
			child.stdout.on("data", (data: string) => {
				if (this.disposed || this.child !== child) return;
				pending += data;
				let end: number;
				while ((end = pending.indexOf("\n")) >= 0) {
					const line = pending.slice(0, end).trim();
					pending = pending.slice(end + 1);
					let event: VoiceEvent;
					try { event = JSON.parse(line) as VoiceEvent; } catch { continue; }
					if (typeof event.kind !== "string" || typeof event.text !== "string") continue;
					if (event.kind === "text") {
						const text = event.text.replace(/[\x00-\x1f\x7f]/g, " ").trim();
						if (text) this.append(text);
					} else {
						reportedError ||= event.kind === "error";
						if (!reportedError || event.kind === "error") this.status = event.text.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 600);
						if (event.kind === "transcribing") {
							this.transcribing = true;
							clearTimeout(this.timer);
							this.timer = setTimeout(() => child.kill(), 180_000);
						}
					}
				}
				this.refresh();
			});
			const finish = (error?: string) => {
				if (this.child !== child) return;
				clearTimeout(this.timer);
				this.child = undefined;
				this.stopping = false;
				this.transcribing = false;
				if (this.disposed) return;
				if (error) this.status = error;
				else if (!reportedError) this.status += " • F4 records more";
				this.refresh();
			};
			child.on("error", error => finish(`Mic unavailable: ${error.message}. You can still type your note.`));
			child.on("close", code => finish(code && !reportedError ? `Mic stopped: ${stderr.replace(/[\x00-\x1f\x7f]/g, " ").trim() || "check Windows microphone permissions/input"}` : undefined));
			child.stdin.on("error", () => {}); // A failed helper can close before the stop request.
			this.timer = setTimeout(() => this.stop(), 305_000);
		} catch (error) {
			this.status = `Mic unavailable: ${error instanceof Error ? error.message : String(error)}`;
		}
		this.refresh();
	}

	stop(cancel = false): void {
		if (this.transcribing) {
			if (cancel) this.child?.kill();
			return;
		}
		if (!this.child || this.stopping) return;
		this.stopping = true;
		this.status = "Stopping microphone… waiting for the last phrase";
		this.child.stdin.end(cancel ? "cancel\n" : "stop\n");
		clearTimeout(this.timer);
		const child = this.child;
		this.timer = setTimeout(() => {
			if (this.child === child) child.kill();
		}, 6000);
		this.refresh();
	}

	dispose(): void {
		this.disposed = true;
		this.stop(true);
	}
}
