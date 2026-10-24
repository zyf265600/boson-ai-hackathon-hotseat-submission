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