import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { learningConfig } from "./learning-vault.ts";

const run = promisify(execFile);
export const resources = {
	notes: { title: "Armstrong Notes & Exercises", id: "1Md_ivzv3bAZ-eZBZZkxYPH1-pU_U9WeVM-yVS4LqtwU", kind: "document" },
	assessments: { title: "Armstrong Assessments & Topics", id: "1rUJZxj2mXKpvQ1DFIvJ5wucU_1wZYva0fv3VqbblOyE", kind: "document" },
	schedule: { title: "Armstrong Tentative Schedule", id: "1509vtqgsKtfy4eqbhArjrOt_OiRBvDcI7rfBHET8p1w", kind: "spreadsheets" },
} as const;
export type Resource = keyof typeof resources;
export interface OnlineResult {
	resource: Resource;
	ok: boolean;
	cached?: boolean;
	fetchedAt?: string;
	files?: string[];
	message?: string;
}

export function armstrongExcerpts(results: OnlineResult[], query: string): string {
	const needle = query.trim().toLowerCase();
	if (!needle) return "";
	const excerpts: string[] = [];
	for (const result of results) {
		if (!result.ok) continue;
		for (const file of result.files ?? []) {
			if (!file.endsWith(".md")) continue;
			const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
			const matches = lines.flatMap((line, index) => line.toLowerCase().includes(needle) ? [index] : []).slice(0, 8);
			if (!matches.length) continue;
			const selected = new Set<number>();
			for (const index of matches) for (let i = Math.max(0, index - 1); i <= Math.min(lines.length - 1, index + 1); i++) selected.add(i);
			excerpts.push(`${file} (fetched ${result.fetchedAt}${result.cached ? ", cached" : ""}):\n` + [...selected].sort((a, b) => a - b).map(index => `${index + 1}: ${lines[index]}`).join("\n"));
		}
	}
	return excerpts.length ? `Relevant text-export excerpts for ${JSON.stringify(query)}. An index entry verifies title/sequence, not linked lesson contents. Read matching PDF pages if formulas or layout matter.\n\n${excerpts.join("\n\n")}`.slice(0, 12000) : `No text-export match for ${JSON.stringify(query)}. Search a related term in the saved files; do not infer missing content.`;
}

function atomicWrite(file: string, value: string | Buffer): void {
	const temp = file + "." + randomUUID() + ".tmp";
	try { fs.writeFileSync(temp, value); fs.renameSync(temp, file); }
	finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export async function download(url: string, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<Buffer> {
	const signals = [AbortSignal.timeout(30000), ...(signal ? [signal] : [])];
	const response = await fetcher(url, { signal: AbortSignal.any(signals), credentials: "omit" });
	if (!response.ok) throw new Error(`Google returned HTTP ${response.status}. Access may have changed; the previous snapshot is retained.`);
	if (/text\/html/i.test(response.headers.get("content-type") ?? "")) throw new Error("Google returned a sign-in or permission page; the previous snapshot is retained.");
	const chunks: Uint8Array[] = [];
	let size = 0;
	if (!response.body) throw new Error("Google returned an empty response");
	const reader = response.body.getReader();
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 20 * 1024 * 1024) throw new Error("Export exceeded the 20 MB download limit");
			chunks.push(value);
		}
	} finally { await reader.cancel().catch(() => {}); }
	if (!size) throw new Error("Google returned an empty export");
	return Buffer.concat(chunks);
}

export async function refreshArmstrong(cwd: string, resource: Resource, refresh = false, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<OnlineResult> {
	const config = learningConfig(cwd);
	if (!config) throw new Error("No learning vault configured");
	const folder = path.join(config.vault, "Sources", "Armstrong Online");
	fs.mkdirSync(folder, { recursive: true });
	const metadata = path.join(folder, resource + ".json");
	if (!refresh && fs.existsSync(metadata)) {
		let previous: OnlineResult | undefined;
		try { previous = JSON.parse(fs.readFileSync(metadata, "utf8")) as OnlineResult; } catch { /* Refresh unreadable cache metadata. */ }
		const age = Date.now() - Date.parse(previous?.fetchedAt ?? "");
		if (previous?.ok && age >= 0 && age < 30 * 60 * 1000 && Array.isArray(previous.files) && previous.files.length && previous.files.every(file => fs.existsSync(file))) return { ...previous, cached: true };
	}
	const item = resources[resource];
	const base = `https://docs.google.com/${item.kind}/d/${item.id}`;
	const fetchedAt = new Date().toISOString();
	try {
		const files: string[] = [];
		if (resource === "schedule") {
			const workbook = await download(base + "/export?format=xlsx", signal, fetcher);
			if (workbook.subarray(0, 2).toString() !== "PK") throw new Error("Invalid schedule workbook export");
			const temporary = path.join(folder, ".schedule-" + randomUUID() + ".xlsx");
			let sheets: { name: string; rows: { row: number; values: string[] }[] }[];
			try {
				fs.writeFileSync(temporary, workbook);
				const extracted = await run("python3", [path.join(cwd, "work", "read-schedule.py"), temporary], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
				sheets = (JSON.parse(extracted.stdout) as { sheets: typeof sheets }).sheets;
			} finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
			if (!sheets.length || !sheets.some(sheet => sheet.rows.some(row => row.values.join(" ").includes("AP Calculus")))) throw new Error("Export does not contain the expected calculus schedule");
			const sections = sheets.map(sheet => `## ${sheet.name}\n\n` + sheet.rows.map(row => `- Row ${row.row}: ` + row.values.map((value, index) => value ? `${index < 26 ? String.fromCharCode(65 + index) : `column ${index + 1}`}: ${value.replace(/\r?\n/g, " / ")}` : "").filter(Boolean).join(" · ")).join("\n"));
			const note = path.join(folder, "Schedule.md");
			atomicWrite(note, `# ${item.title}\n\nFetched: ${fetchedAt}\n\n[Online source](${base}/edit) · [[Sources/Armstrong Online|Online materials]]\n\nTentative plans, not proof of class coverage. All ${sheets.length} workbook tabs are included. Preserve source years; flag inconsistencies instead of silently correcting dates. Row and column labels retain the original layout.\n\n${sections.join("\n\n")}\n`);
			const file = path.join(folder, "Schedule.xlsx");
			atomicWrite(file, workbook);
			files.push(note, file);
		} else {
			const text = (await download(base + "/export?format=txt", signal, fetcher)).toString("utf8").replace(/^\uFEFF/, "").trim();
			if (!text.startsWith("AP Calculus AB") || /^\s*<!doctype|<html/i.test(text)) throw new Error("Export did not contain the expected calculus document");
			const note = path.join(folder, resource === "notes" ? "Notes.md" : "Assessments.md");
			atomicWrite(note, `# ${item.title}\n\nFetched: ${fetchedAt}\n\n[Online source](${base}/edit) · [[Sources/Armstrong Online|Online materials]]\n\nThis is the document's text export. Read the matching PDF for formulas, figures, and layout; linked worksheets are separate sources.\n\n---\n\n${text}\n`);
			files.push(note);
			try {
				const pdf = await download(base + "/export?format=pdf", signal, fetcher);
				if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF export");
				const file = path.join(folder, resource === "notes" ? "Notes.pdf" : "Assessments.pdf");
				atomicWrite(file, pdf);
				files.push(file);
			} catch (error) {
				const result: OnlineResult = { resource, ok: true, fetchedAt, files, message: `Text refreshed; PDF unavailable: ${error instanceof Error ? error.message : String(error)}` };
				atomicWrite(note, fs.readFileSync(note, "utf8") + "\n> [!warning] PDF refresh failed\n> This text is current, but any existing PDF is an older snapshot. Check the tool result before relying on its formulas or layout.\n");
				atomicWrite(metadata, JSON.stringify(result, null, 2));
				return result;
			}
		}
		const result: OnlineResult = { resource, ok: true, fetchedAt, files };
		atomicWrite(metadata, JSON.stringify(result, null, 2));
		return result;
	} catch (error) {
		return { resource, ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}
