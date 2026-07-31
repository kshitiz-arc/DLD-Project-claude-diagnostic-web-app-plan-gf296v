// Typed client for the HYPERION backend.
//
// Every call is offline-tolerant by contract: the caller decides what to do
// when a request throws, and the student flow always has a local fallback
// (plan §9 — the lab may be air-gapped and the laptop may drop off the LAN).
import type { DiagnosticCell, ResponseOption } from "./scoring";

/** Time on task, split so effort and attainment stay separable. */
export interface StudentHistory {
  sessions_started: number; sessions_completed: number; items_answered: number;
  range_runs: number; range_hours: number; test_hours: number; total_hours: number;
  range_minutes: number; test_minutes: number;
  practice_hits: number; best_streak: number;
  first_seen: string; last_seen: string;
  grind: {
    title: string; tagline: string; tier: number;
    next_title: string | null; hours_to_next: number | null; progress: number;
  };
}

export interface ReportConcept {
  concept: string; mastery: number; band: string;
  items_seen: number; misconceptions: number; evidence: string;
}

/** The PTM payload — framed for a parent, not a researcher. */
export interface StudentReport {
  code: string; real_name: string; section: string; class_level: string; subject: string;
  generated_at: string; history: StudentHistory;
  attempted: number; valid: number;
  cells: Record<DiagnosticCell, number>;
  secure_share: number; sbar: number; calibration_bias: number;
  concepts: ReportConcept[];
  talking_points: { concept: string; axis: string; statement: string; note: string }[];
  strengths: string[]; priorities: string[];
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const TOKEN_KEY = "hyperion.teacherToken";

// The teacher token scopes every console/export call. Console scope is read
// from the account behind it server-side, never from a query string (plan §5.i).
let teacherToken: string | null = sessionStorage.getItem(TOKEN_KEY);

export function setTeacherToken(token: string | null): void {
  teacherToken = token;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getTeacherToken(): string | null {
  return teacherToken;
}

function authHeaders(): Record<string, string> {
  return teacherToken ? { "x-teacher-token": teacherToken } : {};
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(), ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders(), ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface DeliveredItem {
  id: number; strand: string; axis: string; statement_text: string;
  difficulty: number; min_read_ms: number;
}
export interface ScoredOut {
  diagnostic_cell: DiagnosticCell; direction_correct: boolean; confidence_high: boolean;
  rt_valid: boolean; xp: number; brier_reward: number;
  strand: string; concept_xp: number; concept_level: number; level_up: boolean;
}
export interface SessionSummary {
  session_id: number; mode: string; stop_reason: string; answered: number; valid: number;
  probes_served: number; cells: Record<DiagnosticCell, number>;
  concepts: { strand: string; xp: number; level: number; mastery: number; variance: number }[];
  convergence: { strand: string; mastery: number; variance: number }[];
  code: string;
}
export interface BoardEntry {
  code: string; avatar_id: number; section: string;
  calibration: number; growth: number; effort: number; xp: number; level: number;
}
export interface CohortStudent {
  code: string; section: string; avatar_id: number; attempted: number;
  cells: Record<DiagnosticCell, number>; vec: number[]; sbar: number;
  invalid: number; completion: number; calibration_bias: number; level: number;
}
export interface CohortOut {
  role: string; scope: string[]; n_students: number;
  kpi: { calibrated_proficiency: number; misconception_density: number };
  students: CohortStudent[];
  concepts: { concept: string; mastery: number; misconception_density: number; n: number }[];
}
export interface Hotspot {
  item_id: number; statement: string; concept: string; axis: string;
  n_misconception: number; n_seen: number; rate: number; note: string;
}
export interface StudentDetail {
  code: string; section: string; avatar_id: number; subject: string;
  attempted: number; valid: number; invalid_share: number;
  cells: Record<DiagnosticCell, number>; sbar: number; calibration_bias: number; mean_rt_ms: number;
  fingerprint: { concept: string; mastery: number; variance: number; misconception_density: number;
    n: number; level: number; seen: boolean }[];
  misconceptions: { item_id: number; statement: string; concept: string; axis: string;
    response: ResponseOption; note: string; response_time_ms: number }[];
  reification_gap: { n: number; mean: number; ci95: [number, number] };
}

export const api = {
  createStudent: (b: { section: string; class_level?: string; subject?: string; avatar_id: number; pin?: string }) =>
    post<{ code: string; pin_set: boolean }>("/api/student/create", b),
  loginStudent: (code: string, pin?: string) =>
    post<{ code: string; section: string; subject: string; avatar_id: number; onboarded: boolean }>(
      "/api/student/login", { code, pin }),
  markOnboarded: (code: string) =>
    post<{ code: string; onboarded: boolean }>("/api/student/onboarded", { code }),
  issueTeacher: (b: { kind: string; subject: string; sections: string[] }, passcode: string) =>
    post<{ teacher_id: string; pin: string; kind: string; label: string; sections: string[] }>(
      "/api/admin/issue-teacher", b, { "x-admin-passcode": passcode }),
  loginTeacher: (teacher_id: string, pin: string) =>
    post<{ teacher_id: string; kind: string; subject: string; sections: string[]; label: string; token: string }>(
      "/api/teacher/login", { teacher_id, pin }),

  startSession: (code: string, mode: "adaptive" | "fixed" = "adaptive", opts: { resume?: boolean; wave?: string } = {}) =>
    post<{ session_id: number; mode: string; cap: number; answered: number; resumed: boolean }>(
      "/api/session/start", { code, mode, resume: opts.resume ?? true, wave: opts.wave ?? "base" }),
  nextItem: (session_id: number) =>
    post<{ done: boolean; item?: DeliveredItem; answered: number; cap: number; probing?: boolean; stop_reason?: string }>(
      "/api/session/next", { session_id }),
  submit: (session_id: number, item_id: number, response_option: ResponseOption, response_time_ms: number) =>
    post<ScoredOut>("/api/response", { session_id, item_id, response_option, response_time_ms }),
  summary: (session_id: number) => get<SessionSummary>(`/api/session/${session_id}/summary`),

  leaderboard: (board: "calibration" | "growth" | "effort", section?: string, limit = 8) =>
    get<{ board: string; section: string | null; entries: BoardEntry[] }>(
      `/api/leaderboard?board=${board}&limit=${limit}${section ? `&section=${section}` : ""}`),

  cohort: (role: "class" | "subject", scope: { section?: string; sections?: string }) =>
    get<CohortOut>(`/api/console/cohort?role=${role}&${role === "class" ? `section=${scope.section ?? "B"}` : `sections=${scope.sections ?? "A,B,C"}`}`),
  hotspots: (role: "class" | "subject", scope: { section?: string; sections?: string }, limit = 6) =>
    get<{ scope: string[]; n_students: number; hotspots: Hotspot[] }>(
      `/api/console/hotspots?role=${role}&limit=${limit}&${role === "class" ? `section=${scope.section ?? "B"}` : `sections=${scope.sections ?? "A,B,C"}`}`),
  student: (code: string) => get<StudentDetail>(`/api/console/student/${encodeURIComponent(code)}`),

  /** Activity history — sessions, RANGE vs test time, the grind title. */
  history: (code: string) => get<StudentHistory>(`/api/student/${encodeURIComponent(code)}/history`),

  /** Log a RANGE warm-up run. Engagement only; never touches the diagnostic. */
  logPractice: (body: { code: string; seconds: number; hits: number; misses: number; best_streak: number }) =>
    post<{ ok: boolean }>("/api/practice", body),

  /** Attach the child's real name for a PTM. The only PII the system holds —
   *  teacher-scoped, excluded from every export, and clearable with "". */
  setStudentName: (code: string, real_name: string) =>
    post<{ ok: boolean; code: string; real_name: string }>(
      `/api/console/student/${encodeURIComponent(code)}/name`, { real_name }),

  report: (code: string) => get<StudentReport>(`/api/console/report/${encodeURIComponent(code)}`),

  /** Download a scoped CSV export through the browser (plan §5.ii, §11). */
  exportUrl: (which: "responses" | "concept-state") => `${BASE}/api/export/${which}.csv`,
  downloadExport: async (which: "responses" | "concept-state") => {
    const res = await fetch(api.exportUrl(which), { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `hyperion-${which}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
