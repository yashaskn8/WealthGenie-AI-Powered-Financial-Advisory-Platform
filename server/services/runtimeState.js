const VALID_PHASES = new Set(['starting', 'ready', 'draining', 'stopped']);

/**
 * Process-local lifecycle state. Kept behind a small interface so the Express
 * app can be instantiated independently in tests while the bootstrap owns all
 * state transitions in production.
 */
export function createRuntimeState({ now = () => Date.now() } = {}) {
  const startedAt = now();
  let phase = 'starting';
  let changedAt = startedAt;

  function transition(nextPhase) {
    if (!VALID_PHASES.has(nextPhase)) throw new Error(`Invalid runtime phase: ${nextPhase}`);
    phase = nextPhase;
    changedAt = now();
  }

  return Object.freeze({
    markStarting: () => transition('starting'),
    markReady: () => transition('ready'),
    markDraining: () => transition('draining'),
    markStopped: () => transition('stopped'),
    isReady: () => phase === 'ready',
    isDraining: () => phase === 'draining',
    snapshot: () => Object.freeze({
      phase,
      startedAt: new Date(startedAt).toISOString(),
      changedAt: new Date(changedAt).toISOString(),
      uptimeMs: Math.max(0, now() - startedAt),
    }),
  });
}
