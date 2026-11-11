// A form's values kept for the sign-in round trip (Google sign-in leaves the page). This tab only, read once.
const key = (name: string) => `gs:draft:${name}`;

export function keepDraft(name: string, values: unknown) {
  try { sessionStorage.setItem(key(name), JSON.stringify(values)); } catch { /* storage blocked: the visitor retypes */ }
}

export function takeDraft<T>(name: string): T | null {
  try {
    const raw = sessionStorage.getItem(key(name));
    sessionStorage.removeItem(key(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
