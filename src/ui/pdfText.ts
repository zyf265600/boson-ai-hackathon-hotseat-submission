// The text of a PDF résumé, read in the browser with pdf.js (pdfjs-dist), so the
// file itself never leaves this machine; only its text goes to the server, for
// the post-interview report. Loaded on first use: most visitors never upload one.

/**
 * All the text in the PDF, page by page, one line per text line. Empty for a
 * scanned PDF (images only); rejects if the file is not a readable PDF.
 */
export async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(text.replace(/[ \t]+\n/g, "\n").trim());
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    void task.destroy();
  }
}
