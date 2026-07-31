/* Codes seen on this device.
 *
 * A child who forgets their code otherwise loses every sitting they have ever
 * done — the record is keyed on the code and there is no email, no phone and
 * no name to recover from, by design. That is the cost of an anonymous
 * instrument, and it needs a deliberate answer rather than an apology.
 *
 * This is the first of three layers:
 *   1. this list — the lab PC a child sat at last time usually still knows
 *   2. their PIN, which is what stops the list from being a way in to someone
 *      else's record on a shared machine
 *   3. the teacher, who can search the roster and reset a PIN in person
 *
 * Storing codes is safe under §10 precisely because a code is not PII: it
 * identifies a record, not a child, and only a teacher can connect the two.
 * The PIN is never stored — that would turn a convenience into a bypass.
 */

const KEY = "hyperion.recentCodes";
const MAX = 6;

export function recentCodes(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string").slice(0, MAX) : [];
  } catch {
    return [];   // private mode, quota, corrupt value — never block sign-in
  }
}

export function rememberCode(code: string): void {
  const c = code.trim().toUpperCase();
  if (!c) return;
  try {
    const next = [c, ...recentCodes().filter((x) => x !== c)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage unavailable: recall is a nicety, not a requirement */ }
}

export function forgetCode(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(recentCodes().filter((x) => x !== code)));
  } catch { /* ignore */ }
}

export function forgetAllCodes(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
