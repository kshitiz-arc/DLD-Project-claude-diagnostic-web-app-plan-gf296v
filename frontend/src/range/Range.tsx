/* RANGE — the warm-up zone that sits *outside* the instrument.
 *
 * Purpose is to get a child's hands and head moving before HYPERION starts, so
 * the first diagnostic items aren't spent learning the interface. It is not an
 * assessment and not a lesson (plan §1 / §7 keep both out of scope):
 *
 *   - nothing here is written to the event store, posted to the server, or
 *     shown to a teacher. It is entirely local to the browser tab.
 *   - it is optional and skippable. Gating the sitting on it would add time to
 *     every re-sit for no measurement gain.
 *
 * CONTENT RULE — do not break this when adding drills. RANGE may only use
 * whole-number arithmetic fact retrieval: + and - within 100 (positive results
 * only), and x and / within the 12 times tables. Every one of the ten assessed
 * strands is off limits, because practising a construct minutes before it is
 * measured turns the diagnostic into a partial measurement of the warm-up:
 *
 *   Integers (no negatives / sign rules)   Fractions        Ratio & %
 *   Algebra          Equations             Exponents        Lines & Angles
 *   Triangles        Mensuration           Data Handling
 *
 * Bare times tables and two-digit sums are prerequisite automaticity that no
 * item in the bank diagnoses, which is exactly why they are safe to warm up on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Sprite";
import { prefersReducedMotion } from "../hooks/useTheme";
import { api } from "../api";
import "./range.css";

const RUN_MS = 60_000;
const OPTIONS = 4;

type Op = "+" | "-" | "x" | "/";
interface Drill { text: string; answer: number; choices: number[]; }

const ri = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Plausible wrong answers: off-by-small and off-by-ten beat random numbers,
 *  because a random distractor is eliminated without doing the arithmetic. */
function distractors(answer: number, op: Op): number[] {
  const deltas = op === "x" || op === "/" ? [1, -1, 2, -2, 3, -3, 10, -10] : [1, -1, 2, -2, 10, -10, 20, -20];
  const out = new Set<number>();
  const shuffled = [...deltas].sort(() => Math.random() - 0.5);
  for (const d of shuffled) {
    const v = answer + d;
    if (v > 0 && v !== answer) out.add(v);
    if (out.size >= OPTIONS - 1) break;
  }
  let pad = answer + 4;
  while (out.size < OPTIONS - 1) { if (pad > 0 && pad !== answer) out.add(pad); pad += 3; }
  return [...out];
}

function makeDrill(): Drill {
  const op: Op = (["+", "-", "x", "/"] as Op[])[ri(0, 3)];
  let a: number, b: number, answer: number;
  switch (op) {
    case "+": a = ri(11, 89); b = ri(11, 99 - a > 10 ? 99 - a : 11); answer = a + b; break;
    // Subtraction is ordered so the result is positive: negatives belong to the
    // Integers strand and are diagnosed, not practised.
    case "-": a = ri(25, 99); b = ri(2, a - 1); answer = a - b; break;
    case "x": a = ri(2, 12); b = ri(2, 12); answer = a * b; break;
    default: b = ri(2, 12); answer = ri(2, 12); a = b * answer; break;
  }
  const text = `${a} ${op === "x" ? "×" : op === "/" ? "÷" : op} ${b}`;
  const choices = [answer, ...distractors(answer, op)].sort(() => Math.random() - 0.5);
  return { text, answer, choices };
}

export function Range() {
  const nav = useNavigate();
  const { session } = useAuth();
  const reduce = useRef(prefersReducedMotion());
  // Anonymous drop-ins are welcome to warm up; there is just nobody to credit
  // the minutes to, so the run simply isn't logged.
  const codeRef = useRef(session?.role === "student" ? session.student.code : "");

  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const [drill, setDrill] = useState<Drill>(() => makeDrill());
  const [hits, setHits] = useState(0);
  const [miss, setMiss] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const [leftMs, setLeftMs] = useState(RUN_MS);

  const endsAt = useRef(0);
  const answerRef = useRef<(v: number) => void>(() => {});

  const begin = useCallback(() => {
    setHits(0); setMiss(0); setStreak(0); setBest(0); setFlash(null);
    setDrill(makeDrill()); setLeftMs(RUN_MS);
    endsAt.current = performance.now() + RUN_MS;
    setPhase("run");
  }, []);

  // Latest tallies, so the run-ended effect can report without re-arming the
  // clock every time a counter moves.
  const tally = useRef({ hits: 0, miss: 0, best: 0 });
  tally.current = { hits, miss, best };

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, endsAt.current - performance.now());
      setLeftMs(left);
      if (left <= 0) {
        setPhase("done");
        // Report *time on task only*. RANGE content stays outside the
        // Q-matrix and this never reaches a concept posterior or a score —
        // it exists so a teacher can see effort. Offline: it just doesn't
        // count, which is the right failure for a non-assessed warm-up.
        const t = tally.current;
        if (codeRef.current) {
          api.logPractice({
            code: codeRef.current,
            seconds: Math.round(RUN_MS / 1000),
            hits: t.hits, misses: t.miss, best_streak: t.best,
          }).catch(() => { /* not measured; losing it costs nothing */ });
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const answer = useCallback((v: number) => {
    if (phase !== "run") return;
    const ok = v === drill.answer;
    if (ok) {
      setHits((h) => h + 1);
      setStreak((s) => { const n = s + 1; setBest((b) => (n > b ? n : b)); return n; });
    } else {
      setMiss((m) => m + 1);
      setStreak(0);
    }
    if (!reduce.current) { setFlash(ok ? "ok" : "no"); setTimeout(() => setFlash(null), 220); }
    setDrill(makeDrill());
  }, [phase, drill]);

  answerRef.current = answer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key);
      if (i >= 1 && i <= OPTIONS) answerRef.current(drill.choices[i - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill]);

  const total = hits + miss;
  const acc = total ? Math.round((hits / total) * 100) : 0;

  return (
    <div className={`rg-root${flash ? ` fl-${flash}` : ""}`}>
      <header className="rg-top">
        <div className="rg-brand">
          <Icon id="s-target" />
          <div>
            <div className="rg-logo">RANGE</div>
            <div className="rg-sub">Warm-up · not scored</div>
          </div>
        </div>
        <button className="rg-btn ghost" onClick={() => nav("/session")}>Enter HYPERION ▸</button>
      </header>

      {phase === "idle" && (
        <section className="rg-card">
          <h1 className="rg-h">Loosen up first</h1>
          <p className="rg-p">
            Sixty seconds of quick number work — times tables and two-digit sums. It warms your
            hands up on the keys so the real thing doesn't start cold.
          </p>
          <p className="rg-note">
            None of this is measured. Nothing here is saved, and nothing reaches your teacher.
            It is also deliberately <em>not</em> the maths HYPERION looks at — no fractions,
            percentages, algebra or shapes.
          </p>
          <div className="rg-actions">
            <button className="rg-btn" onClick={begin}>Start the clock ▸</button>
            <button className="rg-btn ghost" onClick={() => nav("/session")}>Skip to the test</button>
          </div>
        </section>
      )}

      {phase === "run" && (
        <section className="rg-arena">
          <div className="rg-hud">
            <div className="rg-stat"><b>{hits}</b><span>hit</span></div>
            <div className="rg-stat"><b>{streak}</b><span>streak</span></div>
            <div className="rg-stat"><b>{Math.ceil(leftMs / 1000)}</b><span>sec</span></div>
          </div>
          <div className="rg-clock" aria-hidden="true">
            <i style={{ width: `${(leftMs / RUN_MS) * 100}%` }} />
          </div>

          <div className="rg-q" aria-live="off">{drill.text}</div>

          <div className="rg-opts" role="group" aria-label="Pick the answer">
            {drill.choices.map((c, i) => (
              <button key={`${drill.text}-${c}`} className="rg-opt" onClick={() => answer(c)}>
                <span className="rg-key">{i + 1}</span>{c}
              </button>
            ))}
          </div>
        </section>
      )}

      {phase === "done" && (
        <section className="rg-card">
          <h1 className="rg-h">Warm</h1>
          <div className="rg-score">
            <div><b>{hits}</b><span>correct</span></div>
            <div><b>{acc}%</b><span>accuracy</span></div>
            <div><b>{best}</b><span>best streak</span></div>
          </div>
          <p className="rg-note">
            Still not measured — this run is already forgotten. HYPERION starts from scratch.
          </p>
          <div className="rg-actions">
            <button className="rg-btn" onClick={() => nav("/session")}>Enter HYPERION ▸</button>
            <button className="rg-btn ghost" onClick={begin}>Run it again</button>
          </div>
        </section>
      )}
    </div>
  );
}
