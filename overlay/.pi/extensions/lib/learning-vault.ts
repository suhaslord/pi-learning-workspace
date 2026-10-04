import * as fs from "node:fs";
import * as path from "node:path";

export function learningConfig(cwd: string): { vault: string; autoLog: boolean } | undefined {
	const file = path.join(cwd, ".pi", "learning.json");
	if (!fs.existsSync(file)) return undefined;
	const config: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
	if (!config || typeof config !== "object" || !("vaultPath" in config) || typeof config.vaultPath !== "string") {
		throw new Error(".pi/learning.json must specify a vaultPath");
	}
	return { vault: path.resolve(cwd, config.vaultPath), autoLog: "autoLog" in config && config.autoLog === true };
}

export function refreshSessionIndex(vault: string): void {
	const folder = path.join(vault, "Sessions");
	fs.mkdirSync(folder, { recursive: true });
	const links = fs.readdirSync(folder).filter(file => file.endsWith(".md")).sort().reverse()
		.map(file => `- [[Sessions/${file.slice(0, -3)}]]`);
	fs.writeFileSync(path.join(vault, "Sessions.md"), "# Saved lessons\n\n[[Home|Home]]\n\n" +
		(links.join("\n") || "Your first lesson will appear here when Pi opens.") + "\n", "utf8");
}
