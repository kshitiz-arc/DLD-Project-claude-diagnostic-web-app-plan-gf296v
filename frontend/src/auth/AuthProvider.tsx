// Session context (in-memory scaffold). In deployment this talks to the
// FastAPI backend; here it holds the current session and issued teacher IDs.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Session, TeacherId } from "./types";

interface AuthState {
  session: Session | null;
  issued: TeacherId[]; // teacher IDs the admin has generated this session
  setSession: (s: Session | null) => void;
  addIssued: (t: TeacherId) => void;
  clearIssued: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// Survive a refresh. Held in *session*Storage, not localStorage, on purpose:
// a lab PC is shared, so the identity must die when the tab closes rather
// than greet the next child as the previous one. Without this, a reload wiped
// the session and the diagnostic quietly minted a brand-new anonymous account,
// stranding everything the child had already answered under a code nobody knew.
const SESSION_KEY = "hyperion.session";

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;   // private mode / corrupt value must never block sign-in
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(loadSession);
  const [issued, setIssued] = useState<TeacherId[]>([]);

  const setSession = (s: Session | null) => {
    setSessionState(s);
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* storage unavailable: in-memory still works for this tab */ }
  };

  const value = useMemo<AuthState>(
    () => ({
      session,
      issued,
      setSession,
      addIssued: (t) => setIssued((prev) => [t, ...prev]),
      clearIssued: () => setIssued([]),
    }),
    [session, issued],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
