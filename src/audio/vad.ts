import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import modelUrl from "@ricky0123/vad-web/dist/silero_vad_v5.onnx?url";
import { AUDIO_RATE } from "../realtime/sessionConfig";

/** Silero VAD v5 reads 16 kHz audio in frames of 512 samples. */
const MODEL_RATE = 16000;
const FRAME = 512;
/** One frame is 32 ms. */
export const FRAME_MS = (FRAME / MODEL_RATE) * 1000;
/** 24 kHz in, 16 kHz out: one output sample every 1.5 input samples. */
const STEP = AUDIO_RATE / MODEL_RATE;

const zeroState = () => new ort.Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);

/**
 * Silero VAD (github.com/snakers4/silero-vad, MIT; model file from
 * @ricky0123/vad-web) run in the browser with onnxruntime-web. Takes the same
 * 24 kHz PCM16 frames that go to Higgs Realtime and calls `onFrame` with the
 * speech probability (0–1) of every 32 ms.
 */
export class SileroVad {
  private state: ort.Tensor = zeroState();
  private readonly sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(MODEL_RATE)]), []);
  /** 24 kHz samples not yet resampled, and where the next 16 kHz sample falls in them. */
  private input: number[] = [];
  private at = 0;
  private frame = new Float32Array(FRAME);
  private filled = 0;
  /** Frames run one at a time: each needs the state the previous one left. */
  private queue = Promise.resolve();
  /** Bumped by reset(), so frames queued before it are skipped. */
  private epoch = 0;

  private constructor(
    private readonly session: ort.InferenceSession,
    private readonly onFrame: (probability: number) => void,
    private readonly onError: (message: string) => void,
  ) {}

  static async load(onFrame: (probability: number) => void, onError: (message: string) => void): Promise<SileroVad> {
    ort.env.wasm.wasmPaths = { wasm: wasmUrl };
    // Threads need a cross-origin isolated page; one thread runs a frame in ~1 ms anyway.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(modelUrl);
    return new SileroVad(session, onFrame, onError);
  }

  /** Forget the audio and the model's memory of it, e.g. at the start of a turn. */
  reset(): void {
    this.epoch += 1;
    this.state = zeroState();
    this.input = [];
    this.at = 0;
    this.filled = 0;
  }

  push(pcm: Int16Array): void {
    for (const v of pcm) this.input.push(v / 32768);
    // Linear interpolation is enough for a speech / no-speech decision.
    while (this.at + 1 < this.input.length) {
      const i = Math.floor(this.at);
      const f = this.at - i;
      this.frame[this.filled++] = this.input[i] * (1 - f) + this.input[i + 1] * f;
      this.at += STEP;
      if (this.filled === FRAME) {
        const frame = this.frame;
        this.frame = new Float32Array(FRAME);
        this.filled = 0;
        const epoch = this.epoch;
        this.queue = this.queue.then(() => (epoch === this.epoch ? this.run(frame) : undefined));
      }
    }
    const used = Math.floor(this.at);
    this.input.splice(0, used);
    this.at -= used;
  }

  private async run(frame: Float32Array): Promise<void> {
    try {
      const out = await this.session.run({
        input: new ort.Tensor("float32", frame, [1, FRAME]),
        state: this.state,
        sr: this.sr,
      });
      this.state = out.stateN;
      this.onFrame((out.output.data as Float32Array)[0]);
    } catch (e) {
      this.onError(`VAD failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
