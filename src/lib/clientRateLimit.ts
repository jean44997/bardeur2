type RateState = {
  timestamps: number[];
  blockedUntil: number;
  lastActionAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  cooldownMs?: number;
  blockMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

const states = new Map<string, RateState>();

export function checkClientRateLimit({
  key,
  limit,
  windowMs,
  cooldownMs = 0,
  blockMs = windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const state = states.get(key) || { timestamps: [], blockedUntil: 0, lastActionAt: 0 };

  if (state.blockedUntil > now) {
    states.set(key, state);
    return { allowed: false, remaining: 0, retryAfterMs: state.blockedUntil - now };
  }

  if (cooldownMs > 0 && now - state.lastActionAt < cooldownMs) {
    states.set(key, state);
    return { allowed: false, remaining: Math.max(0, limit - state.timestamps.length), retryAfterMs: cooldownMs - (now - state.lastActionAt) };
  }

  state.timestamps = state.timestamps.filter((time) => now - time < windowMs);

  if (state.timestamps.length >= limit) {
    state.blockedUntil = now + blockMs;
    states.set(key, state);
    return { allowed: false, remaining: 0, retryAfterMs: blockMs };
  }

  state.timestamps.push(now);
  state.lastActionAt = now;
  states.set(key, state);

  return { allowed: true, remaining: Math.max(0, limit - state.timestamps.length), retryAfterMs: 0 };
}

export function resetClientRateLimit(keyPrefix: string) {
  Array.from(states.keys()).forEach((key) => {
    if (key.startsWith(keyPrefix)) states.delete(key);
  });
}

export function formatRetryAfter(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}min`;
}
