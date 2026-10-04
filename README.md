# Pi learning workspace

Learn with an AI tutor in your terminal and keep your notes in Obsidian. Pi checks what you know, builds a small learning plan, and teaches one idea at a time.

Includes readable math, local voice notes, saved progress, review questions and optional study focus mode.

## Setup

You need **Windows 11 (64-bit)**, internet and your own AI subscription or API account.

1. Choose **Code → Download ZIP** and extract it to a permanent folder.
2. Double-click **Setup-Learning.cmd**. It installs the tools and creates desktop shortcuts.
3. In Pi, run **`/login`**, then **`/model`** to choose a model your account supports.
4. Type **`/learn <what you want to learn>`**.

If setup installs WSL, restart Windows if prompted, open Ubuntu once to create a user, then run setup again. If Obsidian is already open, close it once so setup can register your new notebook. The first install downloads dependencies; later launches reuse them.

## Use it

Open **Start Learning (Pi)** on your desktop to resume. Keep Pi and Obsidian side by side.

- **`/learn <topic>`** — start a lesson.
- **F4** in a quiz note, or **`/voice`** — talk through your reasoning and review the transcript before submitting.
- **`/materials`** — use your own class notes and documents.
- **`/map`** — see your learning plan.
- **`/review`** — practice from your saved progress.
- **`/lock <goal>`** — optional study mode. [Details and emergency recovery](docs/Study-mode.md).

Your notes, credentials and recordings are excluded from Git. Voice transcription runs locally; submitted text goes to your chosen AI provider.

[Setup options and checks](docs/Setup-and-development.md) · [Sources and attribution](THIRD-PARTY.md)

Based on [Amos Blomqvist's learn](https://github.com/amosblomqvist/learn) and Eero Alvar's *How I Use AI to Learn Things*.
