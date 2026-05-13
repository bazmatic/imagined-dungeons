import {
  type BuilderAgentStepLogEntry,
  BuilderAgentStopReason,
} from '@infra/builder-agent/openai-agent-loop';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  RunBuilderAssistantErrorCode,
  getBuilderAssistantStatus,
  runBuilderAssistant,
} from '~/server/admin/builder-agent';

export type BuilderAssistantPanelProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly worldId: string;
  readonly onApplied: () => Promise<void>;
};

const OpenAiKeyHelp =
  'The builder assistant needs an OpenAI API key. Set OPENAI_API_KEY in the server environment.';

export function BuilderAssistantPanel({
  open,
  onClose,
  worldId,
  onApplied,
}: BuilderAssistantPanelProps) {
  const [llmAvailable, setLlmAvailable] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState('');
  const [maxStepsInput, setMaxStepsInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<readonly BuilderAgentStepLogEntry[]>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const status = await getBuilderAssistantStatus();
        if (!cancelled) {
          setLlmAvailable(status.llmAvailable);
        }
      } catch {
        if (!cancelled) {
          setLlmAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (open && d && !d.open) {
      d.showModal();
      requestAnimationFrame(() => {
        promptRef.current?.focus();
      });
    } else if (!open && d?.open) {
      d.close();
    }
    return () => {
      dialogRef.current?.close();
    };
  }, [open]);

  const submitDisabled = busy || llmAvailable !== true;

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitDisabled) return;

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      setError('Enter a prompt before running the assistant.');
      return;
    }

    const maxTrim = maxStepsInput.trim();
    const data: { readonly worldId: string; readonly prompt: string; readonly maxSteps?: number } =
      maxTrim.length === 0
        ? { worldId, prompt: trimmedPrompt }
        : { worldId, prompt: trimmedPrompt, maxSteps: Number.parseInt(maxTrim, 10) };

    setBusy(true);
    setError(null);
    try {
      const result = await runBuilderAssistant({ data });
      if (result.ok) {
        setSteps(result.steps);
        setLastSummary(result.assistantSummary);
        setError(null);
        const detailParts: string[] = [`Stop: ${result.stopReason}`];
        if (result.errorMessage !== null && result.errorMessage.length > 0) {
          detailParts.push(result.errorMessage);
        }
        if (
          result.stopReason !== BuilderAgentStopReason.Completed ||
          (result.errorMessage !== null && result.errorMessage.length > 0)
        ) {
          setRunInfo(detailParts.join(' — '));
        } else {
          setRunInfo(null);
        }
        await onApplied();
      } else {
        const message =
          result.code === RunBuilderAssistantErrorCode.LlmDisabled ? OpenAiKeyHelp : result.message;
        setError(message);
        setRunInfo(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss mirrors palette; Escape uses onCancel + Close control.
    <dialog
      ref={dialogRef}
      className="assistant-modal-dialog"
      aria-labelledby="assistant-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
      onCancel={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        onClose();
      }}
    >
      <div className="assistant-modal__header">
        <h3 id="assistant-modal-title" className="t-label-caps">
          Builder assistant
        </h3>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="assistant-modal__body">
        {llmAvailable === false ? (
          <p className="t-metadata" style={{ fontStyle: 'italic', marginBottom: 'var(--s-3)' }}>
            {OpenAiKeyHelp}
          </p>
        ) : null}
        <form onSubmit={(e) => void onSubmit(e)}>
          <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
            Describe edits for this draft world. The assistant runs tool calls against the builder;
            the page reloads after a successful run.
          </p>
          <textarea
            ref={promptRef}
            className="manuscript-input-v2 manuscript-input-v2--large"
            rows={5}
            value={prompt}
            disabled={busy}
            onChange={(ev) => setPrompt(ev.target.value)}
            placeholder="e.g. Add a north exit from the tavern to a small alley…"
          />
          <div style={{ marginTop: 'var(--s-3)' }}>
            <span className="form-grid__field-label">Max tool steps (optional)</span>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              Leave blank to use the server default (from env or built-in).
            </p>
            <input
              type="text"
              inputMode="numeric"
              className="manuscript-input-v2"
              style={{ maxWidth: 120 }}
              value={maxStepsInput}
              disabled={busy}
              onChange={(ev) => setMaxStepsInput(ev.target.value)}
              placeholder="default"
            />
          </div>
          {error !== null ? (
            <p className="t-metadata" style={{ color: 'var(--crimson)', marginTop: 'var(--s-3)' }}>
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 'var(--s-3)' }}>
            <button type="submit" className="btn btn--primary" disabled={submitDisabled}>
              {busy ? 'Running…' : 'Run assistant'}
            </button>
          </div>
        </form>
        {lastSummary !== null && lastSummary.length > 0 ? (
          <div style={{ marginTop: 'var(--s-4)' }}>
            <span className="form-grid__field-label">Summary</span>
            <p className="t-data-sm" style={{ marginTop: 'var(--s-2)', whiteSpace: 'pre-wrap' }}>
              {lastSummary}
            </p>
          </div>
        ) : null}
        {runInfo !== null ? (
          <p className="t-metadata" style={{ marginTop: 'var(--s-3)', fontStyle: 'italic' }}>
            {runInfo}
          </p>
        ) : null}
        {steps.length > 0 ? (
          <div style={{ marginTop: 'var(--s-4)' }}>
            <span className="form-grid__field-label">Last run — steps</span>
            <table
              className="t-data-sm"
              style={{
                width: '100%',
                marginTop: 'var(--s-2)',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th
                    className="t-metadata"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--s-2)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Tool
                  </th>
                  <th
                    className="t-metadata"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--s-2)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Ok
                  </th>
                  <th
                    className="t-metadata"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--s-2)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Result preview
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.stepIndex}>
                    <td
                      style={{
                        padding: 'var(--s-2)',
                        borderBottom: '1px solid var(--border)',
                        verticalAlign: 'top',
                      }}
                    >
                      <code>{s.toolName}</code>
                    </td>
                    <td
                      style={{
                        padding: 'var(--s-2)',
                        borderBottom: '1px solid var(--border)',
                        verticalAlign: 'top',
                      }}
                    >
                      {s.ok ? 'yes' : 'no'}
                    </td>
                    <td
                      style={{
                        padding: 'var(--s-2)',
                        borderBottom: '1px solid var(--border)',
                        verticalAlign: 'top',
                        wordBreak: 'break-word',
                      }}
                    >
                      {s.resultPreview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
