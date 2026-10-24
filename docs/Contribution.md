# Contribution for Junwei Quan

## The interview report

When an interview ends, HotSeat writes a report on the candidate's answers. It appears on the end screen after about 15 seconds and is written in the interview's language.

## What it contains

- **Overall score and verdict**: a weighted average of five skills, shown as one of four verdicts: *Ready to interview* (3.5 and up), *Nearly there* (2.75+), *Needs practice* (2+), *Start again*.
- **Five skills**, each scored 1–4 with a short comment and the candidate's own words as evidence:
  | Skill | Weight |
  |---|---|
  | Technical depth | 25% |
  | Trade-offs and judgment | 25% |
  | Results and validation | 20% |
  | Personal contribution | 15% |
  | Clarity and relevance | 15% |
- **STAR check** of the project introduction: whether it covered the Situation, Task, Action and Result.
- **Résumé check** (only if a résumé was added in the prep room): each claim on the résumé is marked *verified*, *shallow*, *mismatch* or *not discussed*, based on what the candidate said.
- **Practice drills**: what went wrong, facts to have ready, a stronger way to say it, and the follow-up question an interviewer would ask. "Rehearse" reads that question aloud in the interviewer's voice.
- **Feedback from each panelist**, which can be played in that panelist's own voice.
- **Delivery**: speaking pace, how long the candidate spoke compared with the panel, and how many questions were answered.

## How it is made

1. The transcript is split into rounds: the introduction, then one round per follow-up question.
2. One LLM call (DeepSeek, without thinking mode) reads the rounds and the résumé and returns the scores, quotes and drills as JSON.
3. The server checks the result: every quote must appear in what the candidate actually said, and numbers the candidate never stated are removed from the drills.
4. The browser shows the report in four tabs (Overview, Rounds, Résumé check, Transcript) and can save it as Markdown or PDF.

Code: `server/report.ts`, `shared/report.ts`, `src/ui/Report.tsx`, `src/ui/reportExport.ts`.

# Contribution for Jingwen Zhong

## How an interview runs

### Before the call

While the waiting screen shows, HotSeat creates the interview, prepares the panel's fixed lines and videos, connects the moderator (Higgs Realtime), and has the moderator's opening ready. Then a 3-2-1 countdown starts the call.

### The interview

1. **Opening**: the moderator greets the candidate, introduces the panel and asks them to introduce one project they built.
2. **Background question**: the moderator thanks them and asks one short, easy question about the project (who it was for, the team, their part). Meanwhile the Technical Lead's first question is being written and turned into video. If that video is still not ready when the answer ends, the moderator asks one more short question.
3. **Follow-ups**: the Technical Lead and the Mentor take turns. Each question is written by an LLM from what the candidate just said. The next question is written while the current one is being answered, so it is ready as soon as the candidate finishes.
4. **Closing**: after the first answer that ends past the chosen length (2–15 minutes), the moderator closes the interview and the report is written.

### Taking turns

- **Has the candidate finished?** Silero VAD in the browser notices a pause of 0.5 s; an LLM then checks whether the answer sounds finished. If not, the panel waits 2 more seconds.
- **Silence**: if the candidate says nothing, the panelist gently checks in after 8, 15 and 25 seconds; after 35 seconds the question counts as unanswered.
- **Requests**: the candidate can ask to repeat or explain a question, skip it, or end the interview.
- **Cutting in**: with "I'm wearing headphones" turned on, the candidate can speak while a panelist is talking; the panelist stops and listens.

### Live captions

The caption panel keeps the whole conversation and can be scrolled back. The panel's words appear in step with the audio. While the candidate speaks, the browser's speech recognition shows a quick draft, which is replaced by the final transcript (Whisper, with Higgs STT as backup).

Code: `src/interview.ts`, `src/orchestrator/`, `src/ui/Captions.tsx`, `src/audio/liveTranscript.ts`.

# Contribution for Peize Zhang

## Talking-head interviewers

With `AVATAR=true` in `.env`, the Technical Lead and the Mentor appear on camera as Higgs Avatar videos when their selected voices have a photo. The moderator stays voice only. The six preset voices have no photo, so a seat using one of them also stays voice only.

## Three kinds of video

| Video | When it plays | How it is made |
|---|---|---|
| **Fixed lines** (silence prompts, the wrap-up, backup questions) | Whenever the panelist says one of these lines | Rendered ahead and kept in `.cache/avatar/`. Matching videos are reused; the cache includes the voice, line, language, emotion and photo. |
| **Follow-up questions** | Each new question | Rendered while the candidate is still answering. If the complete clip is ready, it plays directly; otherwise the question is streamed as video. If video cannot start, the seat falls back to audio. |
| **Listening loop** | While the panelist is silent | A silent clip per custom photo in `public/idle/`, containing a continuous segment followed by its reverse to keep the loop boundary continuous. |

## Photos and listening loops

- **Interview portraits**: the 20 Recommended voices have custom 4:3 photos in `public/portraits/<voice id>.jpg` or `.png`, facing the camera to match the 640 × 480 video. Other catalog voices can use their original photos.
- **Closed-mouth listening**: the idle script generates 60-second silent takes and checks the face frame by frame. It looks for a continuous 15-second segment with the mouth closed and little head movement, especially near the turnaround.
- **Loop playback**: playing that segment forward and backward produces a loop of about 30 seconds. If no suitable 15-second segment is found, the script can try more takes or use a shorter segment. The browser plays the saved file, so replaying it does not generate more video.
- **Fallback**: if a listening loop is unavailable, the interviewer keeps their still photo.

## Adding or replacing a photo

1. Save the photo as `public/portraits/<voice id>.jpg` or `.png`, using the catalog id from `shared/interviewer-voices.json`.
2. Run `npm run avatar:lines -- --portraits --lang en,zh` to update the photo list and render missing fixed-line videos. Existing matching videos are skipped; replacing a photo creates new cache entries. Add `--status` to check progress without rendering.
3. Run `npm run avatar:idle -- --only <voice id>` to make its listening loop. This needs macOS and ffmpeg. Inspect the saved loop before using it in an interview.

Rendering uses Boson credits: about $0.07 per minute of generated 640 × 480 video, including takes that are later trimmed or replaced. Playing saved clips again does not incur another video-generation charge.

Code: `server/boson.ts`, `src/avatar/AvatarStage.ts`, `src/ui/Tile.tsx`, `scripts/avatar-lines.ts`, `scripts/avatar-idle.ts`, `scripts/idle-mouth.swift`, `shared/settings.ts`.
