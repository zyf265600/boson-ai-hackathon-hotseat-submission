import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { pdfText } from "./pdfText";

// Step 1 of the prep room: an optional résumé. Its text (a PDF is read in the
// browser, pdfText.ts) is kept in this browser and sent with the interview; only
// the post-interview report reads it, to check its claims against the answers
// (server/report.ts). The questions never see it.

const RESUME_KEY = "hotseat.resume";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

interface ResumeFile {
  name: string;
  size: number;
  kind: "pdf" | "txt";
  /** The file's text: a .txt as is, a PDF as pdf.js read it. */
  text?: string;
}

interface Resume {
  mode: "file" | "paste";
  file: ResumeFile | null;
  pasted: string;
}

const EMPTY: Resume = { mode: "file", file: null, pasted: "" };

function savedResume(): Resume {
  try {
    const saved = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as Partial<Resume> | null;
    if (saved && typeof saved === "object") {
      return {
        mode: saved.mode === "paste" ? "paste" : "file",
        // A file saved before PDFs were read has no text: it is dropped.
        file:
          saved.file && typeof saved.file.name === "string" && typeof saved.file.text === "string" ? saved.file : null,
        pasted: typeof saved.pasted === "string" ? saved.pasted : "",
      };
    }
  } catch {
    // Storage blocked or bad JSON: start empty.
  }
  return EMPTY;
}

/** Remember the résumé; false if the browser refused (blocked, or too big for storage). */
function saveResume(resume: Resume): boolean {
  try {
    if (!resume.file && !resume.pasted) localStorage.removeItem(RESUME_KEY);
    else localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
    return true;
  } catch {
    return false;
  }
}

/**
 * The résumé text to send with an interview: the uploaded file's or the pasted
 * text, whichever mode is on; undefined when there is none.
 */
export function savedResumeText(): string | undefined {
  const resume = savedResume();
  const text = (resume.mode === "paste" ? resume.pasted : resume.file?.text) ?? "";
  return text.trim() || undefined;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Count({ text }: { text: string }) {
  const n = words(text);
  return (
    <>
      {n.toLocaleString()} {n === 1 ? "word" : "words"} · {text.length.toLocaleString()} characters
    </>
  );
}

/** Which kind of file this is, by extension or type; null if neither PDF nor plain text. */
function kindOf(file: File): ResumeFile["kind"] | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".txt") || file.type === "text/plain") return "txt";
  return null;
}

export function ResumeStep({ onNext }: { onNext: () => void }) {
  const [resume, setResume] = useState<Resume>(savedResume);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  /** A PDF is being read. */
  const [reading, setReading] = useState(false);
  /** Storage refused the last save: say it will not survive a reload. */
  const [notKept, setNotKept] = useState(false);

  useEffect(() => setNotKept(!saveResume(resume)), [resume]);

  async function choose(file: File | undefined) {
    if (!file || reading) return;
    const kind = kindOf(file);
    if (!kind) {
      setError(`"${file.name}" is not a PDF or .txt file. Choose a PDF or a plain-text (.txt) résumé.`);
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError(`"${file.name}" is ${formatSize(file.size)}; the limit is 5 MB.`);
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }
    setError("");
    let text: string;
    if (kind === "txt") {
      text = await file.text();
    } else {
      setReading(true);
      try {
        text = await pdfText(file);
      } catch (err) {
        setError(
          `Could not read "${file.name}" (${(err as Error).message}). Try another PDF, or paste the text instead.`,
        );
        return;
      } finally {
        setReading(false);
      }
    }
    if (!text.trim()) {
      setError(
        `"${file.name}" has no text to read${kind === "pdf" ? " (a scanned PDF is only images)" : ""}. Paste the text instead.`,
      );
      return;
    }
    setResume((r) => ({ ...r, file: { name: file.name, size: file.size, kind, text } }));
  }

  const hasResume = resume.file !== null || resume.pasted.trim() !== "";

  return (
    <div className="step-body">
      <header className="plan-head">
        <h3>Your résumé</h3>
        <p className="muted">
          After the interview, your report checks what your résumé says against your answers. This step is optional:
          skip it if you like.
        </p>
      </header>

      <div className="segmented resume-mode" role="radiogroup" aria-label="How to add your résumé">
        {(["file", "paste"] as const).map((mode) => (
          <button
            key={mode}
            role="radio"
            aria-checked={resume.mode === mode}
            className={resume.mode === mode ? "on" : ""}
            onClick={() => setResume((r) => ({ ...r, mode }))}
          >
            {mode === "file" ? "Upload a file" : "Paste text instead"}
          </button>
        ))}
      </div>

      {resume.mode === "file" &&
        (resume.file ? (
          <div className="resume-file">
            <span className="resume-file-icon">
              <Icon name="doc" size={22} />
            </span>
            <div className="resume-file-text">
              <strong title={resume.file.name}>{resume.file.name}</strong>
              <small className="muted">
                {formatSize(resume.file.size)} ·{" "}
                {resume.file.text !== undefined ? <Count text={resume.file.text} /> : "PDF"}
              </small>
            </div>
            <button className="small-btn" onClick={() => setResume((r) => ({ ...r, file: null }))}>
              <Icon name="trash" size={16} />
              Remove
            </button>
          </div>
        ) : (
          <label
            className={`dropzone ${dragging ? "over" : ""}`}
            aria-busy={reading}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void choose(e.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              disabled={reading}
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="dropzone-icon">
              <Icon name="upload" size={24} />
            </span>
            <strong>
              {reading ? "Reading the PDF…" : "Drag and drop your résumé here, or click to choose a file"}
            </strong>
            <small className="muted">PDF or .txt, up to 5 MB</small>
          </label>
        ))}

      {resume.mode === "paste" && (
        <div className="resume-paste">
          <label htmlFor="resume-text" className="field-label">
            Résumé text
          </label>
          <textarea
            id="resume-text"
            value={resume.pasted}
            placeholder="Paste the text of your résumé here"
            onChange={(e) => setResume((r) => ({ ...r, pasted: e.target.value }))}
          />
          <div className="resume-paste-foot">
            <small className="muted">
              <Count text={resume.pasted} />
            </small>
            {resume.pasted && (
              <button className="small-btn" onClick={() => setResume((r) => ({ ...r, pasted: "" }))}>
                <Icon name="trash" size={16} />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notKept && hasResume && (
        <p className="muted resume-note">This browser could not keep the résumé; it is gone after a reload.</p>
      )}

      <footer className="step-nav">
        <button className="small-btn" onClick={onNext}>
          Skip
        </button>
        <button className="step-next" onClick={onNext}>
          Next
          <Icon name="chevronRight" size={18} />
        </button>
      </footer>
    </div>
  );
}
