import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { VoiceNote } from "./lib/voice-note.ts";

export default function voiceNotes(pi: ExtensionAPI): void {
	pi.registerCommand("voice", {
		description: "Dictate and review a message; return it to the terminal editor without sending",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const initial = ctx.ui.getEditorText();
			const draft = await ctx.ui.custom<string | null>((tui, theme, _keys, done) => {
				const editor = new Editor(tui, {
					borderColor: text => theme.fg("accent", text),
					selectList: {
						selectedPrefix: text => theme.fg("accent", text), selectedText: text => theme.fg("accent", text),
						description: text => theme.fg("muted", text), scrollInfo: text => theme.fg("dim", text), noMatch: text => theme.fg("warning", text),
					},
				});
				editor.setText(initial);
				editor.focused = true;
				editor.disableSubmit = true;
				const voice = new VoiceNote(text => {
					const current = editor.getText();
					editor.setText(current + (current && !/\s$/.test(current) ? " " : "") + text);
				}, () => tui.requestRender());
				return {
					render: width => [
						truncateToWidth(theme.fg("accent", "Talk through your thinking"), width),
						...wrapTextWithAnsi(voice.status, width),
						...editor.render(width),
						...wrapTextWithAnsi("F4 start/stop mic • Ctrl+J newline • Enter keep draft • Esc discard", width),
					],
					invalidate: () => editor.invalidate(),
					handleInput: data => {
						if (matchesKey(data, "f4")) { voice.toggle(); return; }
						if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
							if (voice.active) { voice.stop(); return; }
							done(matchesKey(data, "escape") ? null : editor.getText());
							return;
						}
						editor.handleInput(data);
						tui.requestRender();
					},
					dispose: () => voice.dispose(),
				};
			});
			if (draft !== null) ctx.ui.setEditorText(draft);
		},
	});
}
