# Setup options and development

The complete desktop workflow supports Windows 11 with WSL2 and Ubuntu 24.04. Windows installs use winget. Linux prerequisites may require your Ubuntu password. Setup preserves existing notes, settings and credentials; re-run it after an interrupted download.

```powershell
.\Setup-Learning.ps1 -NoLaunch                 # Install without opening apps
.\Setup-Learning.ps1 -CheckOnly                # Check without recording or AI requests
.\Setup-Learning.ps1 -SkipVoice -SkipBrowser   # Omit optional downloads
.\Setup-Learning.ps1 -Distro Ubuntu-24.04       # Select an installed distro
```

The launcher trusts this repository's local extensions for that run and resumes this workspace's latest Pi session. It does not change global Pi trust. Use `/resume` in Pi to select another session. Keep the repository folder in place so your shortcuts keep working.

Obsidian opens notes using its [path-based URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI). Setup registers the notebook and retains other vaults/settings with a local backup. It refuses to modify a registry belonging to a running Obsidian app; close Obsidian once and re-run setup if prompted.

If authentication fails, use `/login` in Pi. Keep credentials out of the repository. Microphone access may need enabling in Windows privacy settings; setup never records or tests your microphone. Local English dictation requires the speech-model download. Submitted text is sent to your chosen AI provider; audio is transcribed on your PC.

With `-SkipBrowser`, the terminal tutor works, but browser-backed diagram rendering is unavailable. The shell bootstrap can install core tools on Ubuntu; desktop shortcuts, microphone integration and study window pinning require Windows. Other desktop platforms are not tested.

## Source layout

- `dependencies.json`: pinned upstream revisions and runtime versions.
- `patches/`: changes applied to the upstream teaching tools.
- `overlay/`: additional extensions and general teaching guidance.
- `templates/`: a fresh learner profile and Obsidian notebook settings.
- `work/`: setup scripts and regression fixtures.

Installed `.pi/`, `outputs/`, credentials, recordings and runtime dependencies are ignored. A pre-existing unmanaged `.pi` folder is refused to protect another installation. When moving from an older release, use a fresh repository folder and retain your old vault as a backup.

## Validation

After setup, run these commands inside Ubuntu from the repository folder:

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

In Windows PowerShell:

```powershell
.\work\check-vault-registration.ps1
```

Tests use temporary vaults, synthetic attempts and mocked dictation. They make no AI requests, record no audio and leave real learning history untouched. They verify sequencing, evidence and UI behavior; the tutor still must check subject-matter correctness and review reasoning honestly.
