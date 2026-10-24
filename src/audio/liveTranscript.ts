// The DOM lib ships no Web Speech types; this is the slice we use.
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognizerClass = new () => SpeechRecognizer;
const speechWindow = window as unknown as {
  SpeechRecognition?: RecognizerClass;
  webkitSpeechRecognition?: RecognizerClass;
};
const Recognizer = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

/**
 * Rough live captions of the candidate while they talk, from the browser's own
 * recognizer. Higgs STT only transcribes a turn once it is committed, so this
 * fills the gap; its text is replaced by the Higgs transcript afterwards.
 * Does nothing in browsers without Web Speech (e.g. Firefox).
 */
export class LiveTranscript {
  private rec: SpeechRecognizer | null = null;
  private active = false;
  /** Finished phrases from earlier recognizer sessions in this turn. */
  private settled = "";

  /** `lang`: the BCP 47 code the browser recognizes in (shared/languages.ts `browser`). */
  constructor(
    private readonly onText: (text: string) => void,
    private readonly lang = "en-US",
  ) {}

  /** Started and not stopped since (it keeps going across recognizer sessions). */
  get running(): boolean {
    return this.active;
  }

  start(): void {
    if (!Recognizer || this.active) return;
    this.active = true;
    this.settled = "";
    this.onText("");
    this.listen();
  }

  stop(): void {
    this.active = false;
    this.rec?.stop();
    this.rec = null;
    this.onText("");
  }

  private listen(): void {
    const rec = new Recognizer!();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      final = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (this.active) this.onText(`${this.settled} ${final} ${interim}`.replace(/\s+/g, " ").trim());
    };
    // Chrome ends a session after a pause or about a minute; keep listening for the whole turn.
    rec.onend = () => {
      this.settled = `${this.settled} ${final}`.trim();
      if (this.active && this.rec === rec) this.listen();
    };
    this.rec = rec;
    rec.start();
  }
}
