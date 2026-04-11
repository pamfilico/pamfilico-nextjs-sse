"use client";

import { useCallback, useState } from "react";
import { forEachSseJsonDataEvent } from "./forEachSseJsonDataEvent";

/** UI slice for stepped progress; map from any server fields in `mapProgress`. */
export type SseTaskProgress = {
  current: number;
  total: number;
  detail?: string;
};

export type RunSseJsonPostTaskParams = {
  url: string;
  init: RequestInit;
  /** When aborted (e.g. user Cancel), fetch + body read stop; `onAbort` runs instead of `onStreamError` */
  signal?: AbortSignal;
  /** Shown until first `progress` event */
  initialProgress?: SseTaskProgress | null;
  /** If returned non-null, updates `progress` state */
  mapProgress?: (data: Record<string, unknown>) => SseTaskProgress | null;
  onDone: (data: Record<string, unknown>) => void | Promise<void>;
  onStreamError?: (message: string) => void;
  onAbort?: () => void | Promise<void>;
  /** Stream ended without a terminal `done` / `error` event */
  onIncomplete?: () => void;
  onHttpNotOk?: (status: number, message: string) => void;
  onUnauthorized?: () => void;
};

/**
 * POST + read SSE JSON frames (`event`: progress | done | error). Owns `progress` + `isRunning`.
 * Server payload shape is app-defined; only `event` is interpreted here.
 */
export function useSseJsonPostTask() {
  const [progress, setProgress] = useState<SseTaskProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback(async (params: RunSseJsonPostTaskParams): Promise<void> => {
    const {
      url,
      init,
      signal: outerSignal,
      initialProgress = null,
      mapProgress,
      onDone,
      onStreamError,
      onAbort,
      onIncomplete,
      onHttpNotOk,
      onUnauthorized,
    } = params;

    setIsRunning(true);
    setProgress(initialProgress);
    let handledTerminal = false;

    try {
      const res = await fetch(url, {
        ...init,
        signal: outerSignal ?? init.signal,
      });
      if (res.status === 401 && typeof window !== "undefined") {
        setProgress(null);
        onUnauthorized?.();
        return;
      }
      if (!res.ok) {
        let msg = "Request failed";
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        setProgress(null);
        onHttpNotOk?.(res.status, msg);
        return;
      }

      await forEachSseJsonDataEvent(res, async (data) => {
        const ev = data.event;
        if (ev === "progress" && mapProgress) {
          const next = mapProgress(data);
          if (next) setProgress(next);
          return;
        }
        if (ev === "done") {
          handledTerminal = true;
          await onDone(data);
          setProgress(null);
          return;
        }
        if (ev === "error") {
          handledTerminal = true;
          const msg =
            typeof data.message === "string" ? data.message : "Request failed";
          setProgress(null);
          onStreamError?.(msg);
        }
      });

      if (!handledTerminal) {
        setProgress(null);
        onIncomplete?.();
      }
    } catch (e: unknown) {
      setProgress(null);
      const aborted =
        (e instanceof Error && e.name === "AbortError") ||
        (typeof DOMException !== "undefined" &&
          e instanceof DOMException &&
          e.name === "AbortError");
      if (aborted) {
        await onAbort?.();
        return;
      }
      const msg = e instanceof Error ? e.message : "Request failed";
      onStreamError?.(msg);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const resetProgress = useCallback(() => setProgress(null), []);

  return { progress, isRunning, run, resetProgress };
}
