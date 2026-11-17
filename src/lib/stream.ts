/** Reads a streaming response line by line (NDJSON, Server-Sent Events). Resolves when the stream ends. */
export async function readLines(res: Response, onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
  const body = res.body;
  if (!body) {
    // No streaming: fall back to the whole body.
    const text = await res.text();
    for (const line of text.split("\n")) onLine(line.replace(/\r$/, ""));
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const cancel = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", cancel);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        onLine(line);
      }
    }
    buf += decoder.decode();
    if (buf) onLine(buf);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
