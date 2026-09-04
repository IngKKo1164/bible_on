export function rawRead(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

export function rawWrite(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // React state remains usable when browser persistence is unavailable.
  }
}

export function rawRemove(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Cleanup can be retried on the next session.
  }
}

export function rawHas(key) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function rawKeys() {
  if (typeof window === 'undefined') return [];
  try {
    return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter(Boolean);
  } catch {
    return [];
  }
}

