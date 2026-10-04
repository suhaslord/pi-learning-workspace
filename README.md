# Pi learning workspace

An adaptive AI tutor in your terminal, with an Obsidian notebook beside it. Based on [Amos Blomqvist's learn](https://github.com/amosblomqvist/learn) and the principles in Eero Alvar's *How I Use AI to Learn Things*.

Teach at the learner's demonstrated knowledge edge. Put effort into understanding the subject while the tools handle sources, sequencing and saved progress. Pi probes relevant foundations, verifies material, proposes a small dependency map, and teaches through **motivate → establish → connect → quiz-check**. Preparation guides an adaptive lesson; it is never a fixed script or question quota.

## Set up

The complete desktop workflow supports **64-bit Windows 11 with WSL2/Ubuntu 24.04**. You need internet for installation and your own supported AI subscription or API account. Existing WSL users need their Linux password if system packages are missing.

1. Download this repository using GitHub's **Code → Download ZIP**, extract it to a permanent local folder, and double-click **Setup-Learning.cmd**. A local folder outside OneDrive is preferable for the installed dependencies.
2. If WSL is missing, setup requests installation. Follow Windows' restart prompt and open Ubuntu once to create a Linux user, then run setup again.
3. Setup installs Obsidian, Windows Terminal, a pinned Node/Pi runtime, research helpers, diagram tools and local English dictation, registers your notebook, and creates desktop shortcuts. The first installation downloads dependencies and the speech model; it takes time. Subsequent starts reuse them. If another Obsidian vault is already open, close Obsidian once and re-run setup to register the new notebook safely. Existing vault registrations and settings are retained, with a local configuration backup.
4. In Pi, use **`/login`** to sign into your own provider, then **`/model`** to select a model available to that account. For a ChatGPT subscription, choose the OpenAI subscription/OAuth sign-in option shown by Pi. Setup cannot complete account consent for you. Helpers inherit your chosen provider/model.
5. Edit **Learner Profile.md** in Obsidian and type **`/learn <your goal>`** in Pi. Use **Start Learning (Pi)** next time; it opens the notes and resumes this workspace's latest Pi session.

The launcher trusts this repository's local extensions for that run. Review the source before using it; it does not change global Pi project trust. Setup preserves existing notes, provider choices and credentials. It fetches pinned upstream sources and applies the included integration patches instead of requiring you to configure extensions by hand.

## Daily use

- `/learn <goal>`: probe, approve a meaningful plan once, learn one connection at a time, and save evidence.
- Quiz **Note**: explain your reasoning. **F4** starts/stops dictation; review the transcript before submitting. `/voice` drafts a spoken message without sending it. Audio stays in memory and is transcribed locally; accepted text goes to your selected AI provider with your lesson.
- `/materials`: find your own class files in `outputs/Learning Vault/Sources/Class Materials`.
- `/map`: show the saved dependency map. `/review`: retrieve from observed weaknesses before seeing summaries. `/test-prep`: prepare from saved evidence rather than guessing unseen test questions.
- `/lock`: optional study focus mode, pinning Pi and Obsidian beside each other. Normal release requires a fresh foundation/application/transfer test with reviewed reasoning. [Read the recovery controls](docs/Study-mode.md). Setup never starts the lock or records your microphone.

Terminal math uses Unicode and readable stacked notation; Obsidian keeps the original LaTeX and renders formulas and Mermaid diagrams. Selecting a correct option with mistaken reasoning does not establish understanding. Saved mastery needs a reviewed direct check and fresh transfer; an unfinished question is preserved for resumption.

## Optional Armstrong calculus curriculum

In PowerShell, from the extracted folder:

```powershell
.\Setup-Learning.ps1 -Course Armstrong
```

This prepares the full-year local-first course library: topic-specific depth plans, answer-separated original supplemental questions, accessible class notes/exercises, a literal tentative schedule, OpenStax exercise locations and selected primary-source supplements. Originals are downloaded to your ignored local vault, never bundled in this repository. Availability can change; later unpublished class notes and private assessments are not represented as known. Other subjects use the general workflow by default.

Course preparation can take substantially longer than the core setup. `/course <topic>` retrieves a prepared packet; `/questions <lesson>` selects practice; `/course-refresh` updates accessible sources while preserving student progress.

## Options and troubleshooting

```powershell
.\Setup-Learning.ps1 -NoLaunch                 # Install without opening apps
.\Setup-Learning.ps1 -CheckOnly                # Verify without recording or AI calls
.\Setup-Learning.ps1 -SkipVoice -SkipBrowser   # Core tutor; omit these optional downloads
.\Setup-Learning.ps1 -Distro Ubuntu-24.04       # Select an installed Ubuntu 24.04 distro
```

Re-run setup after an interrupted download. It creates missing files and reuses installed dependencies; it does not reset progress. A pre-existing unmanaged `.pi` folder is refused to avoid overwriting another setup. Keep this folder in place after creating shortcuts. To choose a different old session, use Pi's `/resume` command. Microphone access may need enabling in Windows privacy settings; no automatic mic test runs.

The launcher opens notes with Obsidian's [path-based URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI), so setup first registers the local vault. Registration is tested on isolated configurations and refuses to edit settings while an unregistered vault's app is running.

AI authentication errors: use `/login` in Pi; do not place keys in the repository. Windows application installation uses winget and may show OS prompts. Visual browser dependencies on Linux may need Ubuntu's browser libraries; see Puppeteer's official troubleshooting guide. The terminal tutor works with `-SkipBrowser`, but browser-backed diagram rendering requires the browser install.

The shell bootstrap can install the core tools on Ubuntu, but Windows dictation, desktop shortcuts and study window pinning are Windows-specific. macOS and other Linux desktop workflows are not tested.

## Development and privacy

`dependencies.json` pins the upstream revisions and runtime versions. `patches/` holds integration changes; `overlay/` holds added extensions and teaching guidance; `work/` contains the installer, course builders and regression fixtures. `.pi/`, `outputs/`, credentials, recordings, downloaded class material and runtime dependencies are ignored. Share source changes, never your installed vault or account files.

After setup, run the regression suite inside Ubuntu from this folder:

```bash
source work/learning-env.sh
node work/check-install.mjs
node work/check-learning-runtime.mjs
node work/check-learning-workflow.mjs
node work/check-terminal-math.mjs
node work/check-quiz-integrity.mjs
node work/check-voice-notes.mjs
.pi/extensions/visual-tools/node_modules/.bin/tsc -p work/tsconfig.math.json
```

These use synthetic attempts and mock dictation; they do not make AI requests, test your mic or change your real learning history. They check runtime sequencing/evidence and UI integrity, not the semantic correctness of every future AI explanation. The tutor still must verify mathematics and judge reasoning honestly.

## Attribution

See [THIRD-PARTY.md](THIRD-PARTY.md). The original teaching method, upstream skills and upstream code belong to their authors. This repository publishes installation/integration additions and fetches third-party sources at setup time; it does not relicense those sources or downloaded educational material.
