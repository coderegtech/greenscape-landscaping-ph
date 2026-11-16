# Recording, voiceover and editing guide

How to turn [`scenes.json`](scenes.json) into finished videos with OpenScreen (screen recording and editing) and
ElevenLabs (narration). Neither tool was available when this guide was written, so the tool-specific steps follow
each product's documented workflow; check the current documentation at https://getopenscreen.com/ and
https://elevenlabs.io/docs before the first session.

## 1. Prepare a clean, synthetic environment

Record against **local or staging**, never production.

1. Start the stack: `pnpm services:up`, `pnpm supabase:start`, `pnpm dev` (see the root README).
2. Use synthetic data only: the seeds (`pnpm db:seed`, `pnpm content:seed`, `pnpm shop:seed`, `pnpm staff:seed`).
   Demo accounts use `@e2e.greenscape.local` or `@sample.greenscape.local` addresses.
3. Create the demo accounts the way the screenshot run does (`tests/e2e/docs/capture.spec.ts`): a customer, an
   employee linked to an HR record with a schedule, and a super admin. Keep the passwords in a password manager, never
   in a script, the repo or the recording.
4. Give the shop at least one priced, in-stock product (Admin → Products → a size with a price, then Inventory).
5. Use a fresh browser profile: no extensions, bookmarks bar hidden, zoom 100 %, notifications muted, other tabs
   closed. Use a **second** profile for the employee in scene `full-13` (the portals share cookies on localhost).
6. Close terminals and anything showing `.env`, tokens or keys.

## 2. Record with OpenScreen

Settings: 1920 × 1080, 16:9, 30 fps, cursor visible, click highlight on, system audio off (narration is added later).

For each scene in [`master-storyboard.md`](master-storyboard.md):

1. Open the scene's page and set up its data first (for example, clock out before recording a clock-in).
2. Start recording, wait one second, perform the **Screen action** steps at a calm pace, hold the result for two
   seconds, stop.
3. Save as `docs/video/assets/recordings/<scene-id>.mp4` (for example `full-08.mp4`).
4. Watch it back. Retake if anything private, an error overlay, a dev-server indicator or a loading spinner longer
   than a second appears.
5. Set `"recording"` and `"status": "recorded"` for the scene in `scenes.json`.

If OpenScreen offers an MCP server or CLI later, the same loop can be driven by Claude: read each scene from
`scenes.json`, open the route in the browser, record, save under the scene id, update the manifest.

## 3. Generate narration with ElevenLabs

1. Choose one voice that fits "professional, warm, natural" and that your plan licenses for commercial use; put its
   id in `voice.elevenLabsVoiceId`.
2. Keep the API key in your shell environment or a secret manager (`ELEVENLABS_API_KEY`), never in the repo.
3. Generate one file per scene from the scene's `narration` text (only that text: no customer, employee or account
   data goes to ElevenLabs). Apply the `pronunciation` notes, with phonetic respelling or a pronunciation dictionary.
4. Save as `docs/video/assets/audio/<scene-id>.mp3`, set `"audio"` in `scenes.json`.
5. Listen to each file: no clipped first or last words, even loudness (aim for about −16 LUFS), natural pauses.

## 4. Edit and synchronise

1. Lay out scenes in `sceneIds` order for the presentation.
2. Put each scene's audio over its recording. When the audio is longer, extend the hold on the result; when the
   recording is longer, trim waiting time. Do not slow the recording below real speed, and do not speed up typing or
   loading in a way that hides how the app behaves.
3. Apply the **Visual direction** column: zooms, callouts, split screens. Keep transitions to simple cuts and fades.
4. Captions: use the caption lines from [`narration-script.md`](narration-script.md); time them to the final audio
   and export SRT and VTT to `docs/video/assets/captions/<presentation-id>.srt|.vtt`.
5. Music, if any: licensed or original, at least 18 dB under the voice, ducked during narration.
6. Export MP4 (H.264, AAC) to `docs/video/exports/<presentation-id>.mp4`.

## 5. Review before publishing

| Check | Pass when |
|---|---|
| Correct portal and feature | Every scene shows what its narration says, in the real app |
| No private data | No real names, emails, phone numbers, tokens, `.env` or browser history |
| Readable | Interface text legible at 1080p; nothing important cropped |
| Claims | Narration claims only what is on screen and in [system status](../overview/system-status.md) |
| Audio | One voice, no clipping, no silent gaps over 2 s |
| Captions | Match the final audio word for word and in time |
| File | MP4 opens, 16:9, 1920 × 1080, correct scene order |

Record the review in the pull request that adds the video links. Then upload the export to a GitHub Release, set the
presentation's `export`, `url` and `"status": "published"`, run `pnpm docs:validate`, and add the link to the root
README's video section.
