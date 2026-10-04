# Contributing

Bug reports, documentation fixes and improvements for different subjects and learners are welcome. Include your OS, the command you ran, expected behavior and a redacted error when reporting a problem. Never upload credentials, recordings or private learner notes.

Keep changes focused and preserve the teaching method: demonstrated knowledge edge, solid foundations, motivated discovery, approved plans, one reasoning step at a time and honest evidence. New subjects should use the learner's goals and sources rather than impose a fixed course or provider.

Edit `overlay/` for added extensions and `templates/` for new-vault defaults. Upstream tool changes live in `patches/`; keep them applicable to the pinned revisions in `dependencies.json`. Do not commit the installed `.pi/`, `outputs/` or runtime folders. Existing installations preserve their settings and notes; test changed setup/templates in a fresh folder.

Run the relevant [validation commands](docs/Setup-and-development.md#validation) before submitting a pull request. Windows and Ubuntu checks also run in GitHub Actions. State what you tested and any platform limitations.
