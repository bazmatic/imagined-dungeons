import { useCallback, useRef, useState } from 'react';

export const SaveStatus = {
  Idle: 'idle',
  Saving: 'saving',
  Saved: 'saved',
} as const;
export type SaveStatus = (typeof SaveStatus)[keyof typeof SaveStatus];

const SAVED_FLASH_MS = 1800;

export function useSaveStatus(): {
  readonly status: SaveStatus;
  readonly label: string;
  readonly run: (fn: () => Promise<void>) => Promise<void>;
  readonly dirty: boolean;
  readonly markDirty: () => void;
} {
  const [status, setStatus] = useState<SaveStatus>(SaveStatus.Idle);
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useCallback((): void => {
    setDirty(true);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStatus(SaveStatus.Saving);
    try {
      await fn();
      setStatus(SaveStatus.Saved);
      setDirty(false);
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
  return { status, label, run, dirty, markDirty };
}
