# Video presentations

Production package for the Greenscape demo videos. **No video or voiceover has been recorded yet.** Everything here is
ready for recording; nothing in it claims a finished asset.

## Status (2026-11-16)

| Item | Status |
|---|---|
| Scene manifest ([`scenes.json`](scenes.json), schema [`scenes.schema.json`](scenes.schema.json)) | Ready: 32 scenes, 6 presentations, validated by `pnpm docs:validate` |
| Storyboards with estimated timeline ([`master-storyboard.md`](master-storyboard.md)) | Ready (generated) |
| Narration script with captions and pronunciation ([`narration-script.md`](narration-script.md)) | Ready (generated) |
| Shot list ([`shot-list.csv`](shot-list.csv)) and transcript ([`assets/captions/transcript.txt`](assets/captions/transcript.txt)) | Ready (generated) |
| Recording, voiceover, editing and QA instructions ([`recording-guide.md`](recording-guide.md)) | Ready |
| Supporting screenshots | Captured from the running app (`pnpm docs:capture`) |
| Screen recordings | **Not produced**: OpenScreen is not installed on the documentation machine and no OpenScreen CLI or MCP integration was found |
| ElevenLabs voiceover | **Not produced**: no ElevenLabs API key or integration is configured |
| SRT / VTT captions | **Not produced**: they need the real audio timings; the caption text is in the narration script |
| Exports and published URLs | **None** |
| Blocked scenes | 3: Google sign-in, PWA install, device push (reasons in the storyboard) |

## Presentations

| Presentation | Target | Scenes |
|---|---|---|
| Full System Walkthrough | 8–12 min | `full-01` … `full-16` |
| Short Product Overview | 2–3 min | `overview-01` … `overview-07` |
| Promotional Demo | 45–90 s | `promo-01` … `promo-06` |
| Customer Website Walkthrough | 2.5–5 min | full-01, 03–06, 16 |
| Employee Portal Walkthrough | 1.5–4 min | full-07–09, 13 |
| Admin Console Walkthrough | 2.5–6 min | full-10–15 |

## Workflow

1. Edit narration, actions or order **only** in `scenes.json`.
2. `pnpm docs:video:prepare` regenerates the storyboard, script, shot list and transcript.
3. Record and voice each scene as described in [recording-guide.md](recording-guide.md); save files under
   `docs/video/assets/recordings/` and `docs/video/assets/audio/` (kept out of git, see below).
4. Set each scene's `recording` / `audio` path and `status` (`recorded`, then `final`) in `scenes.json`.
5. `pnpm docs:validate` refuses a scene marked recorded without its file, a final scene without audio, and a
   published presentation without a URL.
6. Upload exports to a GitHub Release (or other approved storage), set `export` / `url` / `status: "published"`, and
   only then add the link to the root README.

Raw recordings, audio and exports are large: keep them out of the repository (`docs/video/assets/recordings/`,
`docs/video/assets/audio/` and `docs/video/exports/` are git-ignored) and link the published copies.
