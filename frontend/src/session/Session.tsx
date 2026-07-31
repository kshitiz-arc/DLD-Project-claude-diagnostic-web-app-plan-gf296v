import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { prefersReducedMotion, useTheme } from "../hooks/useTheme";
import { Icon } from "../components/Sprite";
import { useParticles } from "./useParticles";
import { api, type BoardEntry } from "../api";
import {
  brierReward, classifyCell, confidenceStrength, directionCorrect, rtValid, xpItem,
  type DiagnosticCell, type ResponseOption,
} from "../scoring";
import {
  ARSENAL, CONCEPT_SYMBOL, HEAT_MAX, ITEMS, RANKS, STRAND_TO_ARM, TIER, renderStatement,
} from "./items";
import { Tutorial } from "./Tutorial";
import "./session.css";

const CELLMETA: Record<DiagnosticCell, { color: string; icon: string; sub: string }> = {
  SECURE: { color: "var(--secure)", icon: "s-secure", sub: "mastery — true and sure" },
  FRAGILE: { color: "var(--fragile)", icon: "s-fragile", sub: "true, but shaky" },
  GAP: { color: "var(--gap)", icon: "s-gap", sub: "a gap — unsure and off" },
  MISCONCEPTION: { color: "var(--misc)", icon: "s-misc", sub: "confidently off — flagged" },
};

// Ordered as a continuum of p̂: 0.075 → 0.30 → 0.70 → 0.925. `far` marks the
// confident ends, which sit taller because they are further from p̂ = 0.5.
const OPTS: { r: ResponseOption; cls: string; icon: string; flip: boolean; label: string; sub: string; key: string }[] = [
  { r: "AF", cls: "f far", icon: "s-chev2", flip: false, label: "Always False", sub: "Sure", key: "1" },
  { r: "SF", cls: "f", icon: "s-chev1", flip: false, label: "Maybe False", sub: "Unsure", key: "2" },
  { r: "ST", cls: "t", icon: "s-chev1", flip: true, label: "Maybe True", sub: "Unsure", key: "3" },
  { r: "AT", cls: "t far", icon: "s-chev2", flip: true, label: "Always True", sub: "Sure", key: "4" },
];
const BOARDS: { k: "calibration" | "growth" | "effort"; label: string; unit: string; blurb: string }[] = [
  { k: "calibration", label: "Calibration", unit: "% CAL",
    blurb: "How well your confidence matched your truth. Careful, honest strikes climb — blind luck doesn't." },
  { k: "growth", label: "Growth", unit: "% MAS",
    blurb: "Where your concept mastery stands. It only ever rises, so there's nothing to protect by bluffing." },
  { k: "effort", label: "Effort", unit: "VALID",
    blurb: "Answers that cleared the reading floor. Tapping through fast earns exactly nothing here." },
];
const rankFromHeat = (h: number) => Math.max(0, Math.min(RANKS.length - 1, Math.floor(h / TIER)));

interface PlayItem {
  id: number; html: string; strand: string; axis: string; difficulty: number;
  minReadMs: number; truth?: boolean;
}
interface Scored {
  cell: DiagnosticCell; brier: number; xp: number; valid: boolean; dirCorrect: boolean;
  levelUp?: boolean; level?: number; strand?: string;
}
interface Verdict extends Scored { rt: number; floor: number; }

const LOCAL_ITEMS: PlayItem[] = ITEMS.map((it, i) => ({
  id: -(i + 1), // negative ids can never collide with server item ids
  html: renderStatement(it.statement), strand: it.strand, axis: it.axis,
  difficulty: it.difficulty, minReadMs: it.minReadMs, truth: it.truth,
}));

function localScore(r: ResponseOption, it: PlayItem, rt: number): Scored {
  const s = brierReward(r, it.truth!);
  return {
    cell: classifyCell(r, it.truth!), brier: s, xp: xpItem(s, it.difficulty),
    valid: rtValid(rt, it.minReadMs), dirCorrect: directionCorrect(r, it.truth!),
  };
}

export function Session() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { toggle } = useTheme();
  const { canvasRef, burst } = useParticles();
  const reduce = useRef(prefersReducedMotion());

  const code = session?.role === "student" ? session.student.code : "KESTREL·4F";
  const av = code.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase();

  const [lens, setLens] = useState(false);
  const [booted, setBooted] = useState(false);
  const [live, setLive] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [item, setItem] = useState<PlayItem | null>(null);
  const [answered, setAnswered] = useState(0);
  const [cap, setCap] = useState(LOCAL_ITEMS.length);
  const [done, setDone] = useState(false);
  const [probing, setProbing] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [board, setBoard] = useState<"calibration" | "growth" | "effort">("calibration");
  const [entries, setEntries] = useState<BoardEntry[] | null>(null);

  const [rankIndex, setRankIndex] = useState(rankFromHeat(250));
  const [combo, setCombo] = useState(0);
  const [orbs, setOrbs] = useState(0);
  const [dt, setDt] = useState(0);
  const [counts, setCounts] = useState<Record<DiagnosticCell, number>>({ SECURE: 0, FRAGILE: 0, GAP: 0, MISCONCEPTION: 0 });
  const [agg, setAgg] = useState({ sSum: 0, bSum: 0, vN: 0 });
  const [base, setBase] = useState(ARSENAL.map(() => ({ xp: 0, miss: 0 })));
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [toast, setToast] = useState<{ k: string; name: string; sub?: string } | null>(null);

  const heat = useRef(250);
  const locked = useRef(false);
  const tShown = useRef(0);
  const liveRef = useRef(false);
  const sidRef = useRef<number | null>(null);
  const codeRef = useRef(code);
  const cursor = useRef(0);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const rankLtrRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const dmgRef = useRef<HTMLDivElement>(null);
  const rtFillRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<(r: ResponseOption) => void>(() => {});

  const mapDelivered = (d: {
    id: number; strand: string; axis: string; statement_text: string; difficulty: number; min_read_ms: number;
  }): PlayItem => ({
    id: d.id, html: renderStatement(d.statement_text), strand: d.strand, axis: d.axis,
    difficulty: d.difficulty, minReadMs: d.min_read_ms,
  });

  const loadNext = useCallback(async () => {
    if (liveRef.current && sidRef.current != null) {
      try {
        const n = await api.nextItem(sidRef.current);
        setCap(n.cap);
        if (n.done || !n.item) { setItem(null); setDone(true); return; }
        setProbing(!!n.probing);
        setItem(mapDelivered(n.item));
        return;
      } catch { liveRef.current = false; setLive(false); }
    }
    const i = cursor.current;
    if (i >= LOCAL_ITEMS.length) { setItem(null); setDone(true); return; }
    setProbing(false);
    setItem(LOCAL_ITEMS[i]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      liveRef.current = false; sidRef.current = null; cursor.current = 0;
      let needsTutorial = false;
      try {
        let c = code;
        if (!c || c === "KESTREL·4F") c = (await api.createStudent({ section: "B", avatar_id: 1 })).code;
        codeRef.current = c;
        // The scale anchor runs once per child (plan §8); the server remembers,
        // so a re-sit isn't slowed down by a tutorial they've already seen.
        try { needsTutorial = !(await api.loginStudent(c)).onboarded; } catch { needsTutorial = false; }
        const s = await api.startSession(c, "adaptive");
        if (cancelled) return;
        sidRef.current = s.session_id; liveRef.current = true; setLive(true);
        setCap(s.cap); setAnswered(s.answered); cursor.current = s.answered;
        if (s.resumed && s.answered > 0) {
          setToast({ k: "↺", name: "Resumed where you left off", sub: `${s.answered} already answered` });
          setTimeout(() => setToast(null), 2600);
        }
      } catch {
        if (cancelled) return;
        liveRef.current = false; setLive(false); setCap(LOCAL_ITEMS.length);
      }
      await loadNext();
      if (cancelled) return;
      setTutorial(needsTutorial);
      setBooted(true);
    })();
    return () => { cancelled = true; };
  }, [runKey, loadNext, code]);

  // Board data is only meaningful once the sitting is over, so fetch it then.
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    api.leaderboard(board, undefined, 8)
      .then((b) => { if (!cancelled) setEntries(b.entries); })
      .catch(() => { if (!cancelled) setEntries(null); });
    return () => { cancelled = true; };
  }, [done, board]);

  useEffect(() => { rootRef.current?.style.setProperty("--rank", RANKS[rankIndex].color); }, [rankIndex]);

  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const d = (now - last) / 1000; last = now;
      if (!locked.current && !done) heat.current = Math.max(0, heat.current - 7 * d);
      if (gaugeRef.current) gaugeRef.current.style.width = `${(heat.current / HEAT_MAX) * 100}%`;
      const ri = rankFromHeat(heat.current);
      setRankIndex((prev) => (prev !== ri ? ri : prev));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  useEffect(() => {
    if (!item || tutorial) return;  // the clock starts when the item is on screen
    locked.current = false;
    tShown.current = performance.now();
    const f = rtFillRef.current;
    if (f) {
      // The bar fills over *this item's* reading floor (plan §5.4) — a longer
      // statement gets a longer floor, and the child can see the rule.
      f.style.transition = "none"; f.style.width = "0";
      requestAnimationFrame(() => { f.style.transition = `width ${item.minReadMs}ms linear`; f.style.width = "100%"; });
    }
  }, [item, tutorial]);

  const replay = (ref: React.RefObject<HTMLElement>, cls: string) => {
    const el = ref.current; if (!el || reduce.current) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  };

  const answer = useCallback(async (r: ResponseOption) => {
    if (locked.current || done || tutorial || !item) return;
    locked.current = true;
    const rt = performance.now() - tShown.current;

    let sc: Scored;
    if (liveRef.current && sidRef.current != null) {
      try {
        const out = await api.submit(sidRef.current, item.id, r, rt);
        sc = {
          cell: out.diagnostic_cell, brier: out.brier_reward, xp: out.xp, valid: out.rt_valid,
          dirCorrect: out.direction_correct, levelUp: out.level_up, level: out.concept_level,
          strand: out.strand,
        };
      } catch {
        sc = item.truth != null
          ? localScore(r, item, rt)
          : { cell: "GAP", brier: 0, xp: 0, valid: rtValid(rt, item.minReadMs), dirCorrect: false };
      }
    } else {
      sc = localScore(r, item, rt);
    }
    const { cell: cl, brier: s, xp: gain, valid } = sc;
    setOrbs((o) => o + gain);

    let newCombo = combo;
    if (!valid) { heat.current = Math.max(0, heat.current - 120); newCombo = 0; }
    else if (s > 0.5) { newCombo = combo + 1; heat.current = Math.min(HEAT_MAX, heat.current + 70 + Math.min(newCombo * 10, 70)); setDt((d) => Math.min(100, d + (cl === "SECURE" ? 22 : 10))); }
    else if (cl === "MISCONCEPTION") { heat.current = Math.max(0, heat.current - 170); newCombo = 0; setDt((d) => Math.max(0, d - 15)); }
    else { heat.current = Math.max(0, heat.current - 40); newCombo = 0; }
    setCombo(newCombo);

    if (valid) {
      setCounts((c) => ({ ...c, [cl]: c[cl] + 1 }));
      setAgg((a) => ({ sSum: a.sSum + s, bSum: a.bSum + (confidenceStrength(r) - (sc.dirCorrect ? 1 : 0)), vN: a.vN + 1 }));
      const bi = STRAND_TO_ARM[item.strand];
      if (bi != null) setBase((b) => b.map((x, i) => (i === bi ? { xp: x.xp + gain, miss: x.miss + (cl === "MISCONCEPTION" ? 1 : 0) } : x)));
    }

    const ri = rankFromHeat(heat.current);
    if (ri > rankIndex) { setToast({ k: RANKS[ri].k, name: RANKS[ri].name }); burst(window.innerWidth / 2, 90, RANKS[ri].color, 26); setTimeout(() => setToast(null), 2100); }
    else if (sc.levelUp && sc.strand) {
      // Town-Hall progression (plan §8): monotone, so this can only be good news.
      setToast({ k: `${sc.level}`, name: `${sc.strand} · level ${sc.level}`, sub: "Concept levelled up" });
      setTimeout(() => setToast(null), 2100);
    }
    setRankIndex(ri);
    replay(rankLtrRef, "pop"); replay(comboRef, "bump");

    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    if (!valid || cl === "MISCONCEPTION") { replay(hudRef, "shake"); replay(dmgRef, "on"); }
    if (valid && cl === "SECURE") { burst(cx, cy, "var(--secure)", 20); if (newCombo >= 3) burst(cx, cy, "var(--gold)", 10); }
    else if (valid && cl === "MISCONCEPTION") burst(cx, cy, "var(--misc)", 16);
    else if (valid) burst(cx, cy, CELLMETA[cl].color, 8);

    cursor.current += 1;
    setAnswered((a) => a + 1);
    setVerdict({ ...sc, rt, floor: item.minReadMs });
    setTimeout(() => { setVerdict(null); loadNext(); }, 1220);
  }, [combo, done, tutorial, item, rankIndex, burst, loadNext]);

  answerRef.current = answer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, ResponseOption> = { "1": "AF", "2": "SF", "3": "ST", "4": "AT" };
      if (map[e.key]) answerRef.current(map[e.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restart = () => {
    heat.current = 250; locked.current = false; cursor.current = 0;
    setRankIndex(rankFromHeat(250)); setCombo(0); setOrbs(0); setDt(0); setAnswered(0);
    setCounts({ SECURE: 0, FRAGILE: 0, GAP: 0, MISCONCEPTION: 0 }); setAgg({ sSum: 0, bSum: 0, vN: 0 });
    setBase(ARSENAL.map(() => ({ xp: 0, miss: 0 }))); setVerdict(null); setDone(false); setItem(null); setBooted(false);
    setRunKey((k) => k + 1);
  };

  const sBar = agg.vN ? agg.sSum / agg.vN : 0;
  const bias = agg.vN ? agg.bSum / agg.vN : 0;
  const myCal = agg.vN ? Math.round(Math.max(35, Math.min(99, 100 - Math.abs(bias) * 100))) : 72;
  const boardMeta = BOARDS.find((b) => b.k === board)!;
  const AV_TINTS = ["var(--r-a)", "var(--r-c)", "var(--r-s)", "var(--r-b)", "var(--secure)", "var(--fragile)"];
  // Offline, the board is just you — inventing peer scores would be a lie the
  // child can't check, and the board is meant to reward honesty.
  const rows = (entries ?? [{
    code, avatar_id: 0, section: "B", calibration: myCal, growth: Math.round(sBar * 50 + 50),
    effort: agg.vN, xp: orbs, level: 1,
  }]).map((e) => ({
    ...e,
    value: board === "calibration" ? e.calibration : board === "growth" ? e.growth : e.effort,
    me: e.code === code,
    av: e.code.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase(),
  }));

  return (
    <div className="sx-root" ref={rootRef} style={{ ["--rank" as string]: RANKS[rankIndex].color }}>
      <div className="sx-grain" aria-hidden="true" />
      <canvas className="sx-fx" ref={canvasRef} aria-hidden="true" />
      <div className="sx-dmg" ref={dmgRef} aria-hidden="true" />

      <header className="sx-top">
        <div className="sx-brand">
          <Icon id="s-hyperion" />
          <div><div className="sx-logo">HYPER<b>ION</b></div><div className="sx-subttl">{live ? "adaptive · live" : "offline"}</div></div>
        </div>
        <div className="sx-spacer" />
        <div className="sx-tag"><div className="sx-av">{av}</div><div className="sx-who"><b>{code}</b><span>7 · B · Maths</span></div></div>
        <button className={`sx-toggle${lens ? " on" : ""}`} onClick={() => setLens((v) => !v)} aria-pressed={lens}><span className="sx-dot" />Lens</button>
        <button className="sx-ibtn" onClick={toggle} aria-label="Toggle theme">◐</button>
      </header>

      <main className="sx-stage">
        {!booted ? (
          <p className="sx-boot">Establishing uplink…</p>
        ) : tutorial ? (
          <Tutorial onDone={() => {
            setTutorial(false);
            api.markOnboarded(codeRef.current).catch(() => { /* offline: shown anyway */ });
            tShown.current = performance.now();  // don't charge tutorial time to item 1
          }} />
        ) : !done && item ? (
          <div className="sx-hud" ref={hudRef}>
            <div className="sx-ctx">
              <div className="sx-ctx-ic"><Icon id={CONCEPT_SYMBOL[item.strand] ?? "s-target"} /></div>
              <div className="sx-ctx-txt">
                <div className="sx-ctx-strand">{item.strand}</div>
                <div className="sx-ctx-axis">{item.axis}</div>
              </div>
              {probing && <span className="sx-probe">Probing deeper</span>}
              <span className="sx-count"><b>{answered + 1}</b> / {cap}</span>
            </div>

            <p className="sx-statement" dangerouslySetInnerHTML={{ __html: item.html }} />

            <div className="sx-spectrum" role="group" aria-label="How true is it, and how sure are you?">
              {OPTS.map((o) => (
                <button key={o.r} className={`sx-opt ${o.cls}`} onClick={() => answer(o.r)} disabled={!!verdict}>
                  <span className="key">{o.key}</span>
                  <Icon id={o.icon} style={o.flip ? { transform: "scaleX(-1)" } : undefined} />
                  <span className="k">{o.label}</span><span className="sub">{o.sub}</span>
                </button>
              ))}
            </div>
            <div className="sx-scale">
              <span>Certainly false</span><span className="mid">50 / 50</span><span>Certainly true</span>
            </div>

            <div className={`sx-rt${verdict ? " ready" : ""}`}><i ref={rtFillRef} /></div>
          </div>
        ) : (
          <div className="sx-results">
            <div className="sx-rhead">
              <span className="sx-rtitle">Mission clear</span>
              <span className="sx-rsub">{answered} encounters · rank {RANKS[rankIndex].k} · {orbs.toLocaleString()} red orbs</span>
            </div>

            <div className="sx-cellrow">
              {(["SECURE", "FRAGILE", "GAP", "MISCONCEPTION"] as DiagnosticCell[]).map((cl) => (
                <div key={cl} className="sx-cp" style={{ ["--cc" as string]: CELLMETA[cl].color }}>
                  <div className="n">{counts[cl]}</div><div className="l">{cl}</div>
                </div>
              ))}
            </div>

            <div className="sx-rgrid">
              <div>
                <p className="sx-sec">Arsenal · concept devil-arms</p>
                {ARSENAL.map((arm, i) => {
                  const st = base[i]; const lv = 1 + Math.floor(st.xp / 140); const bar = st.xp ? ((st.xp % 140) / 140) * 100 : 8;
                  return (
                    <div key={arm.name} className="sx-arm" style={{ ["--ac" as string]: arm.accent }}>
                      <div className="sx-em"><Icon id={arm.symbol} /></div>
                      <div className="sx-abd">
                        <div className="sx-ar1"><span className="sx-anm">{arm.name}</span>
                          {lens ? <span className="sx-amiss">{st.miss ? `⚑ ${st.miss}` : "clean"}</span> : <span className="sx-alv">LV {lv}</span>}</div>
                        <div className="sx-abar"><i style={{ width: `${bar}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <p className="sx-sec">Style board · never a raw score</p>
                <div className="sx-boardtabs" role="tablist" aria-label="Leaderboard">
                  {BOARDS.map((b) => (
                    <button key={b.k} role="tab" aria-selected={board === b.k} onClick={() => setBoard(b.k)}>
                      {b.label}
                    </button>
                  ))}
                </div>
                {rows.map((p, i) => {
                  const tint = AV_TINTS[p.avatar_id % AV_TINTS.length];
                  return (
                    <div key={p.code} className={`sx-lb${p.me ? " me" : ""}`}>
                      <span className="p">{i + 1}</span>
                      <span className="a" style={{ background: `linear-gradient(150deg, ${p.me ? "var(--gold)" : tint}, color-mix(in oklab, ${p.me ? "var(--gold)" : tint} 50%, #000))` }}>{p.av}</span>
                      <span className="h">{p.code}{p.me ? " · you" : ""}</span>
                      <span className={`v ${p.value >= 85 ? "good" : p.value >= 72 ? "mid" : ""}`}>
                        {p.value}<small>{boardMeta.unit}</small>
                      </span>
                    </div>
                  );
                })}
                <p className="sx-note">{boardMeta.blurb}</p>
              </div>
            </div>

            <div className="sx-actions">
              <button className="sx-btn" onClick={restart}>Re-engage</button>
              <button className="sx-btn ghost" onClick={() => nav("/")}>Switch user</button>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Orbs are yours. The signed diagnostic reaches your teacher.</span>
            </div>
          </div>
        )}
      </main>

      {/* Game chrome lives at the bottom edge, never in the question's space. */}
      {booted && !done && !tutorial && (
        <footer className="sx-strip">
          <div className="sx-rank">
            <div className="sx-rankltr" ref={rankLtrRef}>{RANKS[rankIndex].k}</div>
            <div className="sx-rankmeta">
              <div className="sx-rankword">{RANKS[rankIndex].name}</div>
              <div className="sx-gauge"><div className="sx-gfill" ref={gaugeRef} /></div>
            </div>
          </div>
          <div className={`sx-combo${combo === 0 ? " zero" : ""}`} ref={comboRef}>{combo}<small>× COMBO</small></div>
          <div className="sx-dt">
            <div className="sx-dtlab">Devil Trigger{dt >= 100 ? " · ready" : ""}</div>
            <div className={`sx-dtbar${dt >= 100 ? " full" : ""}`}><div className="sx-dtfill" style={{ width: `${Math.min(100, dt)}%` }} /></div>
          </div>
          <div className="sx-orbs"><Icon id="s-orb" /><div><div className="n">{orbs.toLocaleString()}</div><div className="l">Red orbs</div></div></div>
          {lens && (
            <div className="sx-readout" aria-live="polite">
              <span className="t">Diagnostic lens</span>
              <span>signed s̄ <b className={sBar < 0 ? "neg" : "pos"}>{agg.vN ? `${sBar >= 0 ? "+" : ""}${sBar.toFixed(2)}` : "—"}</b></span>
              <span>calibration <b>{agg.vN ? `${bias >= 0 ? "+" : ""}${bias.toFixed(2)}${bias > 0 ? " over" : " under"}` : "—"}</b></span>
              <span>valid <b>{agg.vN}</b></span>
              <span>· {live ? "server-selected & scored. " : ""}Only your teacher sees these.</span>
            </div>
          )}
        </footer>
      )}

      {verdict && (
        <div className="sx-verdict" aria-live="assertive" style={{ ["--cell" as string]: verdict.valid ? CELLMETA[verdict.cell].color : "var(--faint)" }}>
          <div className="sx-scrim" />
          <div className="sx-vslash">
            <Icon id={verdict.valid ? CELLMETA[verdict.cell].icon : "s-misc"} className="ic" />
            <div className="sx-vbig">{verdict.valid ? verdict.cell : "TOO FAST"}</div>
            <div className="sx-vsub">{verdict.valid ? CELLMETA[verdict.cell].sub : "blind hit — no credit, style broken"}</div>
            {lens && (
              <div className="sx-vdiag">
                {verdict.valid
                  ? <>signed s = <b>{verdict.brier >= 0 ? "+" : ""}{verdict.brier.toFixed(2)}</b> · orbs +{verdict.xp} · cell <b>{verdict.cell}</b></>
                  : <>rt {Math.round(verdict.rt)}ms &lt; {verdict.floor}ms · flagged invalid</>}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="sx-toast show">
          <div className="r">{toast.k}</div>
          <div className="t"><b>{toast.name}</b><span>{toast.sub ?? "Style rank up"}</span></div>
        </div>
      )}
    </div>
  );
}
