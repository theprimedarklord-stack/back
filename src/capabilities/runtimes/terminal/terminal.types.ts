/** Terminal runtime configuration types. */

export interface TerminalConfig {
  /** Shell executable path (e.g., '/bin/bash', 'powershell.exe'). Defaults to system default. */
  shell?: string;

  /** Terminal column count. */
  cols?: number;

  /** Terminal row count. */
  rows?: number;

  /** Initial working directory. */
  cwd?: string;

  /** Environment variables to inject into the terminal session. */
  env?: Record<string, string>;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}
