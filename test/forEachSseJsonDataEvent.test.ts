import { describe, it, expect } from "vitest";
import { forEachSseJsonDataEvent } from "../src/forEachSseJsonDataEvent";

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

describe("forEachSseJsonDataEvent", () => {
  it("parses single data line", async () => {
    const received: Record<string, unknown>[] = [];
    const res = sseResponse(['data: {"event":"done","ok":true}\n\n']);
    await forEachSseJsonDataEvent(res, async (obj) => {
      received.push(obj);
    });
    expect(received).toEqual([{ event: "done", ok: true }]);
  });

  it("buffers split chunks", async () => {
    const received: Record<string, unknown>[] = [];
    const res = sseResponse(['data: {"a":1}', "\n\n"]);
    await forEachSseJsonDataEvent(res, async (obj) => {
      received.push(obj);
    });
    expect(received).toEqual([{ a: 1 }]);
  });

  it("skips non-data lines and invalid json", async () => {
    const received: Record<string, unknown>[] = [];
    const res = sseResponse([
      ": comment\n",
      'data: not-json\n\n',
      'data: {"event":"progress"}\n\n',
    ]);
    await forEachSseJsonDataEvent(res, async (obj) => {
      received.push(obj);
    });
    expect(received).toEqual([{ event: "progress" }]);
  });

  it("throws when body missing", async () => {
    const res = new Response(null, { status: 200 });
    await expect(
      forEachSseJsonDataEvent(res, async () => {}),
    ).rejects.toThrow("no response body");
  });
});
