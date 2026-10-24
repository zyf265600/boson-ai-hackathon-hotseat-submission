import { readFileSync } from "node:fs";
import pg from "pg";
import type { Speaker } from "../shared/panel";
import { languageOr } from "../shared/languages";
import type { Report } from "../shared/report";
import { SEATS, type InterviewSettings, type Seat, type SeatChoice } from "../shared/settings";

export interface Turn {
  id: number;
  speaker: Speaker;
  text: string;
  created_at: string;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://localhost:5432/hotseat",
});

/** Create the tables if they do not exist yet. */
export async function migrate(): Promise<void> {
  await pool.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
}

/** One interview's settings columns (db/schema.sql), named as in the table. */
type SettingsRow = Record<"language" | "role" | "company" | "company_say" | `${Seat}_voice` | `${Seat}_name`, string>;

/**
 * A new interview with the prep room's settings (already checked with checkSettings), the
 * company's companySay and the résumé text ('' for none).
 */
export async function createInterview(settings: InterviewSettings, resume = ""): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO interviews (language, role, company, company_say,
       moderator_voice, moderator_name, technical_lead_voice, technical_lead_name, mentor_voice, mentor_name, resume)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      settings.language,
      settings.role,
      settings.company,
      settings.companySay ?? "",
      ...SEATS.flatMap((seat) => [settings.seats[seat].voice, settings.seats[seat].name]),
      resume,
    ],
  );
  return rows[0].id;
}

/** The résumé given for this interview ('' for none), or null if there is no such interview. */
export async function interviewResume(interviewId: number): Promise<string | null> {
  const { rows } = await pool.query<{ resume: string }>("SELECT resume FROM interviews WHERE id = $1", [interviewId]);
  return rows[0]?.resume ?? null;
}

/** The interview's report, if one was built. */
export async function savedReport(interviewId: number): Promise<Report | null> {
  const { rows } = await pool.query<{ report: Report }>("SELECT report FROM reports WHERE interview_id = $1", [
    interviewId,
  ]);
  return rows[0]?.report ?? null;
}

export async function saveReport(interviewId: number, report: Report): Promise<void> {
  await pool.query(
    `INSERT INTO reports (interview_id, report) VALUES ($1, $2)
     ON CONFLICT (interview_id) DO UPDATE SET report = EXCLUDED.report, created_at = now()`,
    [interviewId, JSON.stringify(report)],
  );
}

/** An interview's settings, or null if there is no such interview. Rows from before the prep room read as the default panel. */
export async function interviewSettings(interviewId: number): Promise<InterviewSettings | null> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT language, role, company, company_say, moderator_voice, moderator_name, technical_lead_voice, technical_lead_name,
       mentor_voice, mentor_name FROM interviews WHERE id = $1`,
    [interviewId],
  );
  const row = rows[0];
  if (!row) return null;
  const seats = Object.fromEntries(
    SEATS.map((seat) => [seat, { voice: row[`${seat}_voice`], name: row[`${seat}_name`] }]),
  ) as Record<Seat, SeatChoice>;
  return {
    language: languageOr(row.language),
    role: row.role,
    company: row.company,
    ...(row.company && row.company_say ? { companySay: row.company_say } : {}),
    seats,
  };
}

/** Change one seat's voice, e.g. the moderator's after Realtime refused the chosen one. False if there is no such interview. */
export async function setSeatVoice(interviewId: number, seat: Seat, voice: string): Promise<boolean> {
  if (!SEATS.includes(seat)) throw new Error(`not a panel seat: ${seat}`);
  // `seat` is one of SEATS, so the column name is safe to write into the query.
  const { rowCount } = await pool.query(`UPDATE interviews SET ${seat}_voice = $2 WHERE id = $1`, [interviewId, voice]);
  return (rowCount ?? 0) > 0;
}

export async function addTurn(interviewId: number, speaker: Speaker, text: string): Promise<Turn> {
  const { rows } = await pool.query<Turn>(
    `INSERT INTO turns (interview_id, speaker, text) VALUES ($1, $2, $3)
     RETURNING id, speaker, text, created_at`,
    [interviewId, speaker, text],
  );
  return rows[0];
}

/** Rewrite one line of the log, e.g. a panel line the candidate cut into, to what was heard. */
export async function updateTurn(interviewId: number, turnId: number, text: string): Promise<Turn | null> {
  const { rows } = await pool.query<Turn>(
    `UPDATE turns SET text = $3 WHERE interview_id = $1 AND id = $2
     RETURNING id, speaker, text, created_at`,
    [interviewId, turnId, text],
  );
  return rows[0] ?? null;
}

export async function listTurns(interviewId: number): Promise<Turn[]> {
  const { rows } = await pool.query<Turn>(
    "SELECT id, speaker, text, created_at FROM turns WHERE interview_id = $1 ORDER BY id",
    [interviewId],
  );
  return rows;
}
