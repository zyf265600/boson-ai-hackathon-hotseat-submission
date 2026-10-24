-- Applied on every server start; every statement is idempotent.

CREATE TABLE IF NOT EXISTS interviews (
  id         SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The speaker-labeled conversation log. Speakers are assigned by the app, not
-- detected: the candidate is the only real microphone.
CREATE TABLE IF NOT EXISTS turns (
  id           SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  speaker      TEXT NOT NULL
               CHECK (speaker IN ('moderator', 'technical_lead', 'mentor', 'candidate')),
  text         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2026-10-22: the Skeptical Reviewer seat became the Mentor. Rows written before
-- that keep 'skeptical_reviewer', so the check still allows it.
ALTER TABLE turns DROP CONSTRAINT IF EXISTS turns_speaker_check;
ALTER TABLE turns ADD CONSTRAINT turns_speaker_check
  CHECK (speaker IN ('moderator', 'technical_lead', 'mentor', 'skeptical_reviewer', 'candidate'));

-- 2026-10-23: each interview's prep-room settings (shared/settings.ts InterviewSettings):
-- language, the role and company practised for, and each panel seat's voice and name.
-- The defaults are the panel from before the prep room, so older rows read as it.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Software Engineer';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS moderator_voice TEXT NOT NULL DEFAULT 'chloe';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS moderator_name TEXT NOT NULL DEFAULT 'Chloe';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS technical_lead_voice TEXT NOT NULL DEFAULT 'oliver';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS technical_lead_name TEXT NOT NULL DEFAULT 'Oliver';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS mentor_voice TEXT NOT NULL DEFAULT 'nora';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS mentor_name TEXT NOT NULL DEFAULT 'Nora';

-- 2026-10-23: how a TTS voice should be given the company name to say it right
-- (server/pronounce.ts): the name itself, a respelling such as "en-VID-ee-uh", or ''
-- when there is no company (and on rows from before).
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS company_say TEXT NOT NULL DEFAULT '';

-- 2026-10-23: the résumé from the prep room's first step, as plain text ('' when
-- none was given). Only the post-interview report reads it (server/report.ts).
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS resume TEXT NOT NULL DEFAULT '';

-- 2026-10-23: the post-interview report (shared/report.ts Report), one per interview.
CREATE TABLE IF NOT EXISTS reports (
  interview_id INTEGER PRIMARY KEY REFERENCES interviews(id) ON DELETE CASCADE,
  report       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
