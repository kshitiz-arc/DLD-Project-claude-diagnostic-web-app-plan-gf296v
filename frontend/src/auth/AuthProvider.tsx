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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [issued, setIssued] = useState<TeacherId[]>([]);

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
