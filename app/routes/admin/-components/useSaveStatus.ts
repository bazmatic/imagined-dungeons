import { useCallback, useRef, useState } from 'react';

export const SaveStatus = {
  Idle: 'idle',
  Saving: 'saving',
  Saved: 'saved',
} as const;
export type SaveStatus = (typeof SaveStatus)[keyof typeof SaveStatus];

const SAVED_FLASH_MS = 1800;

/**
 * Tracks the save lifecycle for an admin form. Returns a tri-state
 * `status`, a `run` wrapper that flips the status during/after the
 * async save call, and a `label` ('Save' | 'Saving…' | 'Saved ✓').
 *
 * Use `disabled={status === 'saving'}` on the submit button and render
 * `label` as its text. The 'saved' state self-clears back to 'idle'
 * after a short flash so the next edit can re-Save without manual reset.
 *
 * Errors thrown inside the wrapped fn revert the status to 'idle' and
 * rethrow so the caller can surface them.
 */
export function useSaveStatus(): {
  readonly status: SaveStatus;
  readonly label: string;
  readonly run: (fn: () => Promise<void>) => Promise<void>;
} {
  const [status, setStatus] = useState<SaveStatus>(SaveStatus.Idle);
  // Cancel an in-flight saved-flash timer if a new save starts before the
  // timer fires; otherwise the Idle overwrite could race with a newly-set
  // Saving.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStatus(SaveStatus.Saving);
    try {
      await fn();
      setStatus(SaveStatus.Saved);
      timer.current = setTimeout(() => {
        setStatus(SaveStatus.Idle);
        timer.current = null;
      }, SAVED_FLASH_MS);
    } catch (err) {
      setStatus(SaveStatus.Idle);
      throw err;
    }
  }, []);

  const label =
    status === SaveStatus.Saving ? 'Saving…' : status === SaveStatus.Saved ? 'Saved ✓' : 'Save';
  return { status, label, run };
}
