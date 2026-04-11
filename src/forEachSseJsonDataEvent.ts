/**
 * Read a fetch Response whose body is SSE (`text/event-stream`) with JSON in each `data:` line.
 * Ignores non-JSON / non-data lines. Does not validate response.ok — caller should check first.
 *
 * Framing matches Python `pamfilico_python_sse.json_stream.encode_sse_json_data_line`.
 */
export async function forEachSseJsonDataEvent(
  response: Response,
  onData: (obj: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Sync failed: no response body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const part = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(6).trim();
      if (!jsonStr) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        continue;
      }
      await onData(data);
    }
  }
}
