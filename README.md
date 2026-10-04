# Pi learning workspace

An adaptive AI tutor in your terminal, with notes in Obsidian. Learn a subject, build a professional skill or work through a course. Pi checks your understanding, agrees on a small plan and teaches one connected idea at a time.

Includes saved progress, review questions, readable math and optional voice notes and study focus mode. No predefined teacher or curriculum; bring your own goals and sources.

## Get started

You need internet and an AI account supported by Pi. Choose your provider with `/login` and your model with `/model`; no particular subscription is required.

**Windows 11 (64-bit):** Download **Code → Download ZIP**, extract it to a permanent folder and double-click **Setup-Learning.cmd**. Setup installs the tools and creates desktop shortcuts. Open **Start Learning (Pi)** to resume later.

If setup installs WSL, restart if prompted, open Ubuntu once to create a user, then run setup again. Close Obsidian once if setup asks to register the new vault.

**Ubuntu 24.04 (core tutor):** Download and extract the repository, then run from its folder:

```bash
bash work/bootstrap.sh
bash work/start-learning.sh
```

Install Obsidian separately and open `outputs/Learning Vault` as a vault. Desktop shortcuts, voice integration and window focus mode currently require Windows. Other platforms are not tested.

## Learn

Type `/learn <your goal>` — for example, understanding recursion, evaluating historical evidence or learning calculus. Optionally fill in **Learner Profile** with your goals, preferred language, experience and constraints. A school, teacher or syllabus is not required.

- `/materials` — use your own notes and documents.
- `/notes` — open the current Obsidian note.
- `/map` — see the agreed learning plan.
- `/review` — practice from saved progress.
- **F4** in a quiz note, or `/voice` — local English dictation on Windows; review the transcript before submitting.
- `/lock <goal>` — optional Windows study focus mode. [Details and recovery](docs/Study-mode.md).

Your notes, credentials and recordings are excluded from Git. Submitted text goes to your chosen AI provider. The teaching method keeps the video's foundations, motivated discovery and **probe → plan → teach** principles; added progress and focus tools support that method.

[Setup and checks](docs/Setup-and-development.md) · [Contributing](CONTRIBUTING.md) · [Attribution](THIRD-PARTY.md)

Based on [Amos Blomqvist's learn](https://github.com/amosblomqvist/learn) and Eero Alvar's *How I Use AI to Learn Things*.
