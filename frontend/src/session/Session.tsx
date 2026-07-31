import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { prefersReducedMotion, useTheme } from "../hooks/useTheme";
import { Icon } from "../components/Sprite";
import { Spider } from "../components/Spider";
import { useParticles } from "./useParticles";
import { api, type BoardEntry, type StudentHistory } from "../api";
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

// Ordered as a continuum of p̂: 0.05 → 0.20 → 0.38 → 0.62 → 0.80 → 0.95.
// `far`/`mid` set the height: the further a band sits from p̂ = 0.5, the taller
// it stands, and the chevron count repeats the same claim a second way.
const OPTS: { r: ResponseOption; cls: string; icon: string; flip: boolean; label: string; sub: string; key: string }[] = [
  { r: "AF", cls: "f far", icon: "s-chev3", flip: false, label: "Always False", sub: "Sure", key: "1" },
  { r: "MF", cls: "f mid", icon: "s-chev2", flip: false, label: "Mostly False", sub: "Fairly sure", key: "2" },
  { r: "SF", cls: "f", icon: "s-chev1", flip: false, label: "Maybe False", sub: "Unsure", key: "3" },
  { r: "ST", cls: "t", icon: "s-chev1", flip: true, label: "Maybe True", sub: "Unsure", key: "4" },
  { r: "MT", cls: "t mid", icon: "s-chev2", flip: true, label: "Mostly True", sub: "Fairly sure", key: "5" },
  { r: "AT", cls: "t far", icon: "s-chev3", flip: true, label: "Always True", sub: "Sure", key: "6" },
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

/** Fingerprint axes, in the bank's canonical strand order. */
const SPIDER_CONCEPTS = Object.keys(CONCEPT_SYMBOL);

/* Devil Trigger — what a filled meter actually buys.

   Expressive only, by design. It changes how the arena looks and how the
   *style* gauge behaves; it never touches the signed diagnostic score, and it
   never touches red orbs — those are scored server-side (xp_item) and feed
   concept_level and the CSV exports, so a bonus there would let a child level
   a concept by transforming rather than by knowing it (plan §1.1).

   The window is counted in valid responses, never in seconds. A timed buff
   would push a child to rush to cash it in, and the RT floor then voids those
   answers as invalid (plan §5.4) — the reward would actively manufacture bad
   data. Counting items removes the clock entirely.

   Violet/gold, not red: --misc is the misconception hue and must keep meaning
   "confidently wrong". A reward wearing the warning colour would blur both. */
const DT_CHARGES = 3;
const DT_HEAT_MULT = 1.6;

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

  // null means "nobody signed in" — someone opened /session directly. Using a
  // sentinel code here meant a child who genuinely owned that call-sign was
  // silently handed a brand-new account instead of their own.
  const signedInCode = session?.role === "student" ? session.student.code : null;
  const code = signedInCode ?? "GUEST";
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
  const [dtActive, setDtActive] = useState(false);
  const [dtLeft, setDtLeft] = useState(0);
  const [triggers, setTriggers] = useState(0);
  const [counts, setCounts] = useState<Record<DiagnosticCell, number>>({ SECURE: 0, FRAGILE: 0, GAP: 0, MISCONCEPTION: 0 });
  // Per-concept tallies for the fingerprint. Built from what this sitting
  // actually saw rather than fetched, so the chart is true offline and needs
  // no console-scoped endpoint from a student's browser.
  const [byConcept, setByConcept] = useState<Record<string, { seen: number; correct: number; misc: number; rt: number }>>({});
  const [history, setHistory] = useState<StudentHistory | null>(null);
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
  // Mirrored as refs so answer() can read the trigger state without taking a
  // dependency on it and re-binding on every charge spent.
  const dtOn = useRef(false);
  const dtLeftRef = useRef(0);
  const dtFxRef = useRef<HTMLElement>(null);
  const unleashRef = useRef<() => void>(() => {});

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
        // Only mint an account when nobody is signed in at all. Matching on a
        // code value would steal the sitting of whoever owned that call-sign.
        const c = signedInCode ?? (await api.createStudent({ section: "B", avatar_id: 1 })).code;
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
  }, [runKey, loadNext, signedInCode]);

  // Board data is only meaningful once the sitting is over, so fetch it then.
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    api.leaderboard(board, undefined, 8)
      .then((b) => { if (!cancelled) setEntries(b.entries); })
      .catch(() => { if (!cancelled) setEntries(null); });
    return () => { cancelled = true; };
  }, [done, board]);

  // The child's running record across every sitting and every RANGE run.
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    api.history(codeRef.current)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch(() => { if (!cancelled) setHistory(null); });
    return () => { cancelled = true; };
  }, [done]);

  useEffect(() => { rootRef.current?.style.setProperty("--rank", RANKS[rankIndex].color); }, [rankIndex]);

  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const d = (now - last) / 1000; last = now;
      // Style holds while transformed — the classic "gauge doesn't drain in DT".
      // Only the *idle* bleed pauses; the penalties in answer() are untouched.
      if (!locked.current && !done && !dtOn.current) heat.current = Math.max(0, heat.current - 7 * d);
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

  // Spending the meter is manual on purpose. The reward a child remembers is
  // choosing the moment to burn it; firing it automatically at 100 would make
  // it wallpaper they never notice.
  const unleash = useCallback(() => {
    if (dt < 100 || dtOn.current || done || tutorial || !item) return;
    dtOn.current = true; dtLeftRef.current = DT_CHARGES;
    setDtActive(true); setDtLeft(DT_CHARGES); setDt(0); setTriggers((t) => t + 1);
    setToast({ k: "⟁", name: "Devil Trigger", sub: `unleashed · next ${DT_CHARGES} valid answers` });
    setTimeout(() => setToast(null), 2200);
    replay(dtFxRef, "on");
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    burst(cx, cy, "var(--violet)", 38);
    burst(cx, cy, "var(--gold)", 22);
  }, [dt, done, tutorial, item, burst]);
  unleashRef.current = unleash;

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
    setOrbs((o) => o + gain);   // server-scored; the trigger never multiplies this

    const inDT = dtOn.current;
    let newCombo = combo;
    if (!valid) { heat.current = Math.max(0, heat.current - 120); newCombo = 0; }
    else if (s > 0.5) {
      newCombo = combo + 1;
      const kick = 70 + Math.min(newCombo * 10, 70);
      heat.current = Math.min(HEAT_MAX, heat.current + (inDT ? kick * DT_HEAT_MULT : kick));
      // The meter is spent, not topped up, while you are transformed.
      if (!inDT) setDt((d) => Math.min(100, d + (cl === "SECURE" ? 22 : 10)));
    }
    // Confident-wrong is the product: it costs the same style whether or not
    // the child is transformed, and it still drains the meter.
    else if (cl === "MISCONCEPTION") { heat.current = Math.max(0, heat.current - 170); newCombo = 0; if (!inDT) setDt((d) => Math.max(0, d - 15)); }
    else { heat.current = Math.max(0, heat.current - 40); newCombo = 0; }
    setCombo(newCombo);

    // A charge is only spent on an answer that counted — a rushed one buys the
    // child nothing here either.
    if (inDT && valid) {
      const left = Math.max(0, dtLeftRef.current - 1);
      dtLeftRef.current = left;
      setDtLeft(left);
      if (left === 0) {
        dtOn.current = false;
        setDtActive(false);
        setToast({ k: "◇", name: "Trigger spent", sub: "build the meter and go again" });
        setTimeout(() => setToast(null), 1800);
      }
    }

    if (valid) {
      setCounts((c) => ({ ...c, [cl]: c[cl] + 1 }));
      setByConcept((m) => {
        const cur = m[item.strand] ?? { seen: 0, correct: 0, misc: 0, rt: 0 };
        return {
          ...m,
          [item.strand]: {
            seen: cur.seen + 1,
            correct: cur.correct + (sc.dirCorrect ? 1 : 0),
            misc: cur.misc + (cl === "MISCONCEPTION" ? 1 : 0),
            rt: cur.rt + rt,
          },
        };
      });
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
    if (valid && cl === "SECURE") {
      burst(cx, cy, "var(--secure)", 20);
      if (newCombo >= 3) burst(cx, cy, "var(--gold)", 10);
      if (inDT) burst(cx, cy, "var(--violet)", 18);   // a hit lands harder while transformed
    }
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
      const map: Record<string, ResponseOption> = {
        "1": "AF", "2": "MF", "3": "SF", "4": "ST", "5": "MT", "6": "AT",
      };
      if (map[e.key]) answerRef.current(map[e.key]);
      else if (e.key === "t" || e.key === "T") unleashRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restart = () => {
    heat.current = 250; locked.current = false; cursor.current = 0;
    dtOn.current = false; dtLeftRef.current = 0;
    setDtActive(false); setDtLeft(0); setTriggers(0);
    setRankIndex(rankFromHeat(250)); setCombo(0); setOrbs(0); setDt(0); setAnswered(0);
    setCounts({ SECURE: 0, FRAGILE: 0, GAP: 0, MISCONCEPTION: 0 }); setAgg({ sSum: 0, bSum: 0, vN: 0 });
    setByConcept({}); setHistory(null);
    setBase(ARSENAL.map(() => ({ xp: 0, miss: 0 }))); setVerdict(null); setDone(false); setItem(null); setBooted(false);
    setRunKey((k) => k + 1);
  };

  // Beta(1,1) posterior mean, the same smoothing the server's mastery model
  // uses: an unseen concept sits at 0.5 rather than 0, and one lucky hit does
  // not read as total mastery.
  const spiderAxes = SPIDER_CONCEPTS.map((label) => {
    const c = byConcept[label];
    return {
      label,
      value: c ? (c.correct + 1) / (c.seen + 2) : 0.5,
      evidence: c?.seen ?? 0,
    };
  });

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
    <div className={`sx-root${dtActive ? " dt-on" : ""}`} ref={rootRef} style={{ ["--rank" as string]: RANKS[rankIndex].color }}>
      <div className="sx-grain" aria-hidden="true" />
      <canvas className="sx-fx" ref={canvasRef} aria-hidden="true" />
      <div className="sx-dmg" ref={dmgRef} aria-hidden="true" />
      <div className="sx-dtfx" aria-hidden="true"><i className="sx-embers" /><i className="sx-dtflash" ref={dtFxRef} /></div>

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
              <span className="sx-rsub">
                {answered} encounters · rank {RANKS[rankIndex].k} · {orbs.toLocaleString()} red orbs
                {triggers > 0 && <> · <b className="sx-rtrig">⟁ {triggers} devil trigger{triggers > 1 ? "s" : ""}</b></>}
              </span>
            </div>

            {/* Plain view. Three plain-language buckets, not four pieces of
                jargon — a twelve-year-old should be able to read their own
                result without a glossary. The precise four-cell breakdown is
                still there, one Lens click away. */}
            <div className="sx-plain">
              <div className="sx-pl" style={{ ["--cc" as string]: "var(--secure)" }}>
                <div className="n">{counts.SECURE}</div>
                <div className="l">Solid</div>
                <div className="d">right, and you knew it</div>
              </div>
              <div className="sx-pl" style={{ ["--cc" as string]: "var(--fragile)" }}>
                <div className="n">{counts.FRAGILE + counts.GAP}</div>
                <div className="l">Shaky</div>
                <div className="d">you weren't sure — that's honest</div>
              </div>
              <div className="sx-pl" style={{ ["--cc" as string]: "var(--misc)" }}>
                <div className="n">{counts.MISCONCEPTION}</div>
                <div className="l">Worth a look</div>
                <div className="d">sure, but it didn't hold up</div>
              </div>
            </div>

            {history && (
              <div className="sx-grind">
                <div className="sx-gtitle">
                  <b>{history.grind.title}</b>
                  <span>{history.grind.tagline}</span>
                </div>
                <div className="sx-gstats">
                  <span><b>{history.sessions_started}</b> sittings</span>
                  <span><b>{history.test_hours.toFixed(1)}h</b> in the test</span>
                  <span><b>{history.range_hours.toFixed(1)}h</b> on the RANGE</span>
                  <span><b>{history.total_hours.toFixed(1)}h</b> total grind</span>
                </div>
                {history.grind.next_title && (
                  <div className="sx-gnext">
                    <div className="sx-gbar"><i style={{ width: `${history.grind.progress * 100}%` }} /></div>
                    <span>{history.grind.hours_to_next}h to <b>{history.grind.next_title}</b></span>
                  </div>
                )}
              </div>
            )}

            {!lens && (
              <p className="sx-lenshint">
                Turn on <b>Lens</b> (top right) to see the full breakdown — your concept
                fingerprint, calibration, and where the evidence is thin.
              </p>
            )}

            {lens && (
              <div className="sx-adv">
                <div className="sx-advgrid">
                  <div>
                    <p className="sx-sec">Concept fingerprint</p>
                    <Spider axes={spiderAxes} />
                    <p className="sx-note">
                      Distance from the centre is how well that concept held up. The dashed
                      ring is the "developing" line. A hollow point marked <b>?</b> means
                      too few items to be sure yet — a spike on one question is not a claim.
                    </p>
                  </div>
                  <div>
                    <p className="sx-sec">The four cells</p>
                    <div className="sx-cellrow">
                      {(["SECURE", "FRAGILE", "GAP", "MISCONCEPTION"] as DiagnosticCell[]).map((cl) => (
                        <div key={cl} className="sx-cp" style={{ ["--cc" as string]: CELLMETA[cl].color }}>
                          <div className="n">{counts[cl]}</div><div className="l">{cl}</div>
                        </div>
                      ))}
                    </div>

                    <p className="sx-sec" style={{ marginTop: 18 }}>Measurement</p>
                    <dl className="sx-metrics">
                      <div><dt>signed s̄</dt><dd className={sBar < 0 ? "neg" : "pos"}>
                        {agg.vN ? `${sBar >= 0 ? "+" : ""}${sBar.toFixed(3)}` : "—"}</dd></div>
                      <div><dt>calibration</dt><dd>
                        {agg.vN ? `${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ${bias > 0.05 ? "over" : bias < -0.05 ? "under" : "level"}` : "—"}</dd></div>
                      <div><dt>valid / answered</dt><dd>{agg.vN} / {answered}</dd></div>
                      <div><dt>rushed (no credit)</dt><dd>{answered - agg.vN}</dd></div>
                      <div><dt>concepts touched</dt><dd>{Object.keys(byConcept).length} / {SPIDER_CONCEPTS.length}</dd></div>
                      <div><dt>thin evidence</dt><dd>{spiderAxes.filter((a) => (a.evidence ?? 0) < 2).length} concepts</dd></div>
                    </dl>

                    <p className="sx-sec" style={{ marginTop: 18 }}>Per concept</p>
                    <div className="sx-ctable">
                      {spiderAxes.map((a) => {
                        const c = byConcept[a.label];
                        return (
                          <div key={a.label} className={`sx-crow${(a.evidence ?? 0) < 2 ? " thin" : ""}`}>
                            <span className="c">{a.label}</span>
                            <span className="m">{Math.round(a.value * 100)}%</span>
                            <span className="e">{c ? `${c.correct}/${c.seen}` : "—"}</span>
                            <span className="x">{c?.misc ? `⚑ ${c.misc}` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <p className="sx-note">
                  These are the numbers your teacher sees. Nothing here changes your orbs
                  or your rank — the two scores stay separate on purpose.
                </p>
              </div>
            )}

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
          <div className={`sx-dt${dtActive ? " on" : ""}`} aria-live="polite">
            <div className="sx-dtlab">
              <span>Devil Trigger{dtActive ? " · unleashed" : dt >= 100 ? " · ready" : ""}</span>
              {dtActive
                ? <b className="sx-dtleft">{dtLeft} left</b>
                : dt >= 100
                  ? <button className="sx-unleash" onClick={unleash}>Unleash<kbd>T</kbd></button>
                  : null}
            </div>
            <div className={`sx-dtbar${dt >= 100 ? " full" : ""}${dtActive ? " live" : ""}`}>
              <div className="sx-dtfill" style={{ width: `${dtActive ? 100 : Math.min(100, dt)}%` }} />
            </div>
            {triggers > 0 && (
              <div className="sx-dttally" title={`${triggers} unleashed this sitting`}>
                {"⟁".repeat(Math.min(triggers, 6))}{triggers > 6 ? ` ×${triggers}` : ""}
              </div>
            )}
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
