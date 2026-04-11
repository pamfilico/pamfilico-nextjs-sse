import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSseJsonPostTask } from "../src/useSseJsonPostTask";

function streamResponse(events: Record<string, unknown>[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("useSseJsonPostTask", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
  });

  it("runs onDone on terminal done event", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      streamResponse([{ event: "done", registered: 3 }]),
    );

    const onDone = vi.fn();
    const { result } = renderHook(() => useSseJsonPostTask());

    await act(async () => {
      await result.current.run({
        url: "http://x/api",
        init: { method: "POST" },
        onDone,
      });
    });

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ event: "done", registered: 3 }),
    );
    expect(result.current.isRunning).toBe(false);
  });

  it("calls onAbort when fetch rejects with AbortError", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const onAbort = vi.fn();
    const { result } = renderHook(() => useSseJsonPostTask());

    await act(async () => {
      await result.current.run({
        url: "http://x/api",
        init: { method: "POST" },
        onDone: vi.fn(),
        onAbort,
      });
    });

    expect(onAbort).toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });
});
