// Just enough MP4 (ISO BMFF) parsing to play Higgs Avatar's fragmented-MP4
// stream through Media Source Extensions. addSourceBuffer() needs the exact
// codecs, and Boson does not document them, so they are read from the
// stream's own header (`moov`). Shared by the browser (src/avatar/) and the
// A6 measurement script (scripts/avatar-a6.ts).

export interface Mp4Header {
  /** RFC 6381 codec strings, one per track, e.g. ["avc1.64001f", "mp4a.40.2"]. */
  codecs: string[];
  /** The file has a sound track. */
  audio: boolean;
  /** Seconds, from `mvhd`; 0 when unknown (fragmented streams usually leave it 0). */
  duration: number;
}

interface Box {
  type: string;
  /** Offset of the box's payload, after its size and type. */
  body: number;
  end: number;
}

/**
 * Read the header at the start of `bytes`. Returns null while `moov` has not
 * fully arrived; throws if the data is not an MP4 we can stream. With
 * `wholeFile`, `bytes` is a finished file, whose header may follow the video data.
 */
export function readMp4Header(bytes: Uint8Array, wholeFile = false): Mp4Header | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  for (;;) {
    const box = readBox(view, offset, bytes.length);
    if (!box || box.end > bytes.length) return null;
    if (box.type === "moov") return parseMoov(view, box);
    if (!wholeFile && (box.type === "moof" || box.type === "mdat")) {
      throw new Error("the video data arrived before its header");
    }
    offset = box.end;
  }
}

function readBox(view: DataView, offset: number, limit: number): Box | null {
  if (offset + 8 > limit) return null;
  const size = view.getUint32(offset);
  const type = fourcc(view, offset + 4);
  if (size === 1) {
    // 64-bit size follows the type.
    if (offset + 16 > limit) return null;
    return { type, body: offset + 16, end: offset + Number(view.getBigUint64(offset + 8)) };
  }
  // Size 0 runs to the end of the file, which a stream does not know yet.
  if (size === 0) return { type, body: offset + 8, end: Number.MAX_SAFE_INTEGER };
  if (size < 8) throw new Error(`bad MP4 box "${type}"`);
  return { type, body: offset + 8, end: offset + size };
}

/** The boxes inside `parent`, starting at `from` (its payload by default). */
function children(view: DataView, parent: Box, from = parent.body): Box[] {
  const boxes: Box[] = [];
  for (let offset = from; ; ) {
    const box = readBox(view, offset, parent.end);
    if (!box || box.end > parent.end) return boxes;
    boxes.push(box);
    offset = box.end;
  }
}

function child(view: DataView, parent: Box, type: string, from?: number): Box | undefined {
  return children(view, parent, from).find((box) => box.type === type);
}

function parseMoov(view: DataView, moov: Box): Mp4Header {
  const codecs: string[] = [];
  let audio = false;
  for (const trak of children(view, moov).filter((box) => box.type === "trak")) {
    const mdia = child(view, trak, "mdia");
    const hdlr = mdia && child(view, mdia, "hdlr");
    // hdlr: version and flags (4), pre_defined (4), then the handler type.
    const handler = hdlr ? fourcc(view, hdlr.body + 8) : "";
    if (!mdia || (handler !== "vide" && handler !== "soun")) continue;
    const minf = child(view, mdia, "minf");
    const stbl = minf && child(view, minf, "stbl");
    const stsd = stbl && child(view, stbl, "stsd");
    // stsd: version and flags (4), entry count (4), then the first sample entry.
    const entry = stsd && readBox(view, stsd.body + 8, stsd.end);
    if (!entry) continue;
    codecs.push(handler === "vide" ? videoCodec(view, entry) : audioCodec(view, entry));
    audio ||= handler === "soun";
  }
  if (codecs.length === 0) throw new Error("the video header has no video or sound track");
  const mvhd = child(view, moov, "mvhd");
  return { codecs, audio, duration: mvhd ? mvhdSeconds(view, mvhd) : 0 };
}

function videoCodec(view: DataView, entry: Box): string {
  if (entry.type === "avc1" || entry.type === "avc3") {
    // A visual sample entry has 78 bytes of fields before its child boxes.
    const avcC = child(view, entry, "avcC", entry.body + 78);
    // avcC: version, then profile, profile compatibility and level, one byte each.
    if (avcC) return `${entry.type}.${[1, 2, 3].map((i) => hex(view.getUint8(avcC.body + i))).join("")}`;
  }
  // Anything else (HEVC, AV1, …) needs more than a four-character code; the
  // browser's isTypeSupported() check then turns it down and the caller falls back.
  return entry.type;
}

function audioCodec(view: DataView, entry: Box): string {
  if (entry.type === "Opus") return "opus";
  if (entry.type !== "mp4a") return entry.type;
  // An audio sample entry has 28 bytes of fields before its child boxes;
  // QuickTime sound description versions 1 and 2 add 16 or 36 more.
  const version = view.getUint16(entry.body + 8);
  const esds = child(view, entry, "esds", entry.body + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0));
  return (esds && esdsCodec(view, esds)) ?? "mp4a.40.2";
}

/** AAC's codec string from its elementary stream descriptor, e.g. "mp4a.40.2" for AAC-LC. */
function esdsCodec(view: DataView, esds: Box): string | null {
  // esds: version and flags (4), then an ES descriptor (tag 3).
  const es = descriptor(view, esds.body + 4);
  if (es.tag !== 0x03) return null;
  let offset = es.body + 2; // ES_ID
  const flags = view.getUint8(offset++);
  if (flags & 0x80) offset += 2; // dependsOn_ES_ID
  if (flags & 0x40) offset += 1 + view.getUint8(offset); // URL
  if (flags & 0x20) offset += 2; // OCR_ES_Id
  const config = descriptor(view, offset); // DecoderConfigDescriptor (tag 4)
  if (config.tag !== 0x04) return null;
  const objectType = view.getUint8(config.body);
  if (objectType !== 0x40) return `mp4a.${hex(objectType)}`;
  // After object type (1), stream type (1), buffer size (3) and two bitrates (8)
  // comes the AudioSpecificConfig (tag 5), whose first 5 bits are the AAC object type.
  const specific = descriptor(view, config.body + 13);
  if (specific.tag !== 0x05) return "mp4a.40.2";
  const first = view.getUint8(specific.body);
  const aot = first >> 3 === 31 ? 32 + (((first & 0x07) << 3) | (view.getUint8(specific.body + 1) >> 5)) : first >> 3;
  return `mp4a.40.${aot}`;
}

/** An MPEG-4 descriptor: a tag, then a length of 1–4 bytes with 7 bits each. */
function descriptor(view: DataView, offset: number): { tag: number; body: number } {
  const tag = view.getUint8(offset);
  let body = offset + 1;
  for (let i = 0; i < 4 && view.getUint8(body++) & 0x80; i++);
  return { tag, body };
}

function mvhdSeconds(view: DataView, mvhd: Box): number {
  const version = view.getUint8(mvhd.body);
  const timescale = view.getUint32(mvhd.body + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(view.getBigUint64(mvhd.body + 24)) : view.getUint32(mvhd.body + 16);
  return timescale ? duration / timescale : 0;
}

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
}

const hex = (byte: number) => byte.toString(16).padStart(2, "0");
