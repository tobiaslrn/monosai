export interface WorktreePorts {
  readonly dev: number;
  readonly e2e: number;
  readonly pwa: number;
}

export function worktreePorts(env?: Record<string, string | undefined>): WorktreePorts;
