import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { download, refreshArmstrong, type Resource } from "./armstrong-online.ts";
import { learningConfig } from "./learning-vault.ts";

const run = promisify(execFile);
export interface LessonLink { url: string; label: string; context: string; page: number; index: Resource; indexFetchedAt: string; parentUrl?: string; }
export interface LinkedResult { url: string; ok: boolean; path?: string; pages?: number; fetchedAt?: string; cached?: boolean; message?: string; }

export async function extractLinks(pdf: string, signal?: AbortSignal): Promise<Omit<LessonLink, "index" | "indexFetchedAt">[]> {
	const result = await run("python3", [fileURLToPath(new URL("./armstrong-links.py", import.meta.url)), pdf], { timeout: 35000, maxBuffer: 4 * 1024 * 1024, signal });
	return JSON.parse(result.stdout) as Omit<LessonLink, "index" | "indexFetchedAt">[];
}

export async function findArmstrongLinks(cwd: string, query: string, refresh = false, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<{ links: LessonLink[]; warnings: string[] }> {
	const links: LessonLink[] = [];
	const warnings: string[] = [];
	for (const index of ["notes", "assessments"] as const) {
		const snapshot = await refreshArmstrong(cwd, index, refresh, signal, fetcher);
		const pdf = snapshot.files?.find(file => file.endsWith(".pdf"));
		if (!snapshot.ok || !pdf) { warnings.push(`${index}: ${snapshot.message ?? "No current index PDF available"}`); continue; }
		try {
			const extracted = await extractLinks(pdf, signal);
			const needle = query.trim().toLowerCase();
			for (const item of extracted) {
				if ((item.label + " " + item.context).toLowerCase().includes(needle)) links.push({ ...item, index, indexFetchedAt: snapshot.fetchedAt! });
			}
		} catch (error) { warnings.push(`${index}: link extraction failed: ${error instanceof Error ? error.message : String(error)}`); }
	}
	const unique = [...new Map(links.map(link => [link.url, link])).values()];
	return { links: unique.slice(0, 50), warnings: [...warnings, ...(unique.length > 50 ? ["More than 50 links match; use a narrower query before downloading."] : [])] };
}

export async function embeddedArmstrongLinks(parent: LessonLink, result: LinkedResult, signal?: AbortSignal): Promise<LessonLink[]> {
	if (!result.ok || !result.path || !result.fetchedAt) return [];
	const extracted = await extractLinks(result.path, signal);
	return [...new Map(extracted.filter(link => link.url !== parent.url).map(link => [link.url, { ...link, label: link.label || parent.label + " — attached PDF", context: link.context || parent.context, index: parent.index, indexFetchedAt: result.fetchedAt!, parentUrl: parent.url }])).values()];
}

export async function fetchArmstrongLink(cwd: string, link: LessonLink, refresh = false, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LinkedResult> {
	const config = learningConfig(cwd);
	if (!config) throw new Error("No learning vault configured");
	const match = /^https:\/\/(docs\.google\.com\/document|drive\.google\.com\/file)\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(link.url);
	if (!match) throw new Error("Only Google document or Drive file links from Armstrong's index are supported");
	const id = match[2];
	const folder = path.join(config.vault, "Sources", "Armstrong Online", "Linked");
	fs.mkdirSync(folder, { recursive: true });
	const file = path.join(folder, id + ".pdf");
	const metadata = path.join(folder, id + ".json");
	if (!refresh && fs.existsSync(metadata) && fs.existsSync(file)) {
		try {
			const previous = JSON.parse(fs.readFileSync(metadata, "utf8")) as LinkedResult;
			const age = Date.now() - Date.parse(previous.fetchedAt ?? "");
			if (previous.ok && previous.url === link.url && age >= 0 && age < 30 * 60 * 1000) return { ...previous, cached: true };
		} catch { /* Refresh invalid metadata. */ }
	}
	const temporary = file + "." + randomUUID() + ".tmp";
	try {
		const url = match[1].startsWith("docs") ? `https://docs.google.com/document/d/${id}/export?format=pdf` : `https://drive.google.com/uc?export=download&id=${id}`;
		const pdf = await download(url, signal, fetcher);
		if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("The linked file was not a PDF; no snapshot replaced");
		fs.writeFileSync(temporary, pdf);
		const info = await run("pdfinfo", [temporary], { timeout: 30000, maxBuffer: 1024 * 1024, signal });
		const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1]);
		if (!pages) throw new Error("Could not validate the linked PDF");
		fs.renameSync(temporary, file);
		const result: LinkedResult = { url: link.url, ok: true, path: file, pages, fetchedAt: new Date().toISOString() };
		const metaTemp = metadata + "." + randomUUID() + ".tmp";
		try { fs.writeFileSync(metaTemp, JSON.stringify({ ...result, label: link.label, context: link.context, index: link.index, indexPage: link.page, indexFetchedAt: link.indexFetchedAt }, null, 2)); fs.renameSync(metaTemp, metadata); }
		finally { if (fs.existsSync(metaTemp)) fs.unlinkSync(metaTemp); }
		return result;
	} catch (error) { return { url: link.url, ok: false, message: `${error instanceof Error ? error.message : String(error)}. Any previous snapshot is retained; it is not proof of current access.` }; }
	finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
