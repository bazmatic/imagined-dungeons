/**
 * File-backed logger for engine diagnostics.
 *
 * Writes one line per call to `./logs/engine.log` (relative to the process
 * cwd) AND mirrors to stdout/stderr so the dev terminal still shows
 * everything live. The file is the artefact you point at when something
 * went wrong and you want to see exactly what the engine did.
 *
 * Configurable via env:
 *   ENGINE_LOG_PATH   override the log file path (default: ./logs/engine.log)
 *   ENGINE_LOG_NONE=1 disable file output entirely (still mirrors to console)
 *
 * Lines are appended; the file is never truncated by the logger. Rotate or
 * delete it manually between sessions if you want a clean run.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Level = 'info' | 'warn' | 'error';

const FILE_DISABLED = process.env.ENGINE_LOG_NONE === '1';
const LOG_PATH = process.env.ENGINE_LOG_PATH ?? resolve(process.cwd(), 'logs/engine.log');

let dirEnsured = false;
function ensureDir(): void {
  if (dirEnsured || FILE_DISABLED) return;
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    dirEnsured = true;
  } catch {
    // Best-effort; if we can't create the directory we just skip file output.
  }
}

function write(level: Level, message: string): void {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${message}\n`;
  if (level === 'warn' || level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
  if (FILE_DISABLED) return;
  ensureDir();
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // Don't let logging fail the request.
  }
}

export const log = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message),
};
