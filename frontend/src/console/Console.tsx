import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../hooks/useTheme";
import { Icon } from "../components/Sprite";
import { api, type CohortOut, type CohortStudent, type Hotspot, type StudentDetail } from "../api";
import type { DiagnosticCell } from "../scoring";
import { HelpPanel } from "./HelpPanel";
import { ALL, CONCEPTS, HOTSPOTS, SECTIONS, STATUS_LABEL, type Student, statusOf } from "./mockData";
import "./console.css";

const AV_COLORS = ["var(--admin)", "var(--r-a)", "var(--gap)", "var(--secure)", "var(--fragile)", "var(--gold)"];

/** Map a server cohort row into the client Student shape the roster renders. */
function toStudent(c: CohortStudent): Student {
  return {
    code: c.code, av: c.code.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase(),
    avc: AV_COLORS[c.avatar_id % AV_COLORS.length], section: c.section,
    attempted: c.attempted, completion: c.completion, invalid: c.invalid, cal: c.calibration_bias,
    cells: c.cells, vec: c.vec, sbar: c.sbar,
  };
}

/** Offline stand-in so the panel renders the same shape with or without a server. */
function mockDetail(s: Student): StudentDetail {
  return {
    code: s.code, section: s.section, avatar_id: 0, subject: "Maths",
    attempted: s.attempted, valid: Math.round(s.attempted * (1 - s.invalid)),
    invalid_share: s.invalid, cells: s.cells, sbar: s.sbar,
    calibration_bias: s.cal, mean_rt_ms: 0,
    fingerprint: CONCEPTS.map((concept, i) => ({
      concept, mastery: s.vec[i], variance: 0.02, misconception_density: 0, n: 0, level: 1, seen: true,
    })),
    misconceptions: [], reification_gap: { n: 0, mean: 0, ci95: [0, 0] },
  };
}

type Role = "class" | "subject";
const CELL_COLOR: Record<DiagnosticCell, string> = { SECURE: "var(--secure)", FRAGILE: "var(--fragile)", GAP: "var(--gap)", MISCONCEPTION: "var(--misc)" };
const pct = (x: number) => Math.round(x * 100);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ORDER: Record<string, number> = { misc: 0, low: 1, fragile: 2, secure: 3 };

export function Console() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { toggle } = useTheme();

  const teacher = session?.role === "teacher" ? session.teacher : null;
  // Scope follows the signed-in account (plan §5.i). The server enforces it
  // regardless; this only decides what the UI asks for.
  const mySections = (teacher?.sections ?? ["7B"]).map((s) => s.replace(/^7/, ""));
  const initialRole: Role = teacher?.kind === "subject" ? "subject" : "class";
  const [role, setRole] = useState<Role>(initialRole);
  const [secs, setSecs] = useState<Record<string, boolean>>(
    () => Object.fromEntries(["A", "B", "C"].map((k) => [k, mySections.includes(k) || !teacher])),
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");

  const [live, setLive] = useState<CohortOut | null>(null);
  const [hot, setHot] = useState<Hotspot[] | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const activeSections = useMemo(() => ["A", "B", "C"].filter((k) => secs[k]), [secs]);
  const scope = useMemo(
    () => (role === "class"
      ? { section: mySections[0] ?? "B" }
      : { sections: (activeSections.length ? activeSections : mySections).join(",") }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, activeSections.join(",")],
  );

  // Live cohort + hotspots for the current scope; fall back to mock data so the
  // console is demonstrable without a server (plan §9 offline tolerance).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cohort, hotspots] = await Promise.all([
          api.cohort(role, scope),
          api.hotspots(role, scope).catch(() => null),
        ]);
        if (cancelled) return;
        setLive(cohort);
        setHot(hotspots?.hotspots ?? null);
      } catch {
        if (!cancelled) { setLive(null); setHot(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [role, scope]);

  const mockCohort = useMemo<Student[]>(
    () => (role === "class" ? SECTIONS.B : ALL.filter((s) => secs[s.section])),
    [role, secs],
  );
  const cohort = useMemo<Student[]>(
    () => (live ? live.students.map(toStudent) : mockCohort), [live, mockCohort],
  );

  useEffect(() => {
    if (!cohort.length) return;
    if (!selected || !cohort.some((s) => s.code === selected)) setSelected(cohort[0].code);
  }, [cohort, selected]);

  // The detail panel reads the *selected* student from the server — never a
  // look-up in a different list, which is how a console ends up showing one
  // child's numbers under another child's name.
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    const fallback = cohort.find((s) => s.code === selected);
    api.student(selected)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(fallback ? mockDetail(fallback) : null); });
    return () => { cancelled = true; };
  }, [selected, cohort]);

  const kpis = useMemo(() => {
    const n = cohort.length || 1;
    let att = 0, misc = 0, inval = 0, comp = 0, sbar = 0;
    cohort.forEach((s) => { att += s.attempted; misc += s.cells.MISCONCEPTION; inval += s.invalid; comp += s.completion; sbar += s.sbar; });
    const flagged = cohort.filter((s) => statusOf(s) === "misc").length;
    return {
      n: cohort.length,
      miscD: live ? live.kpi.misconception_density : misc / (att || 1),
      invD: inval / n,
      sbarD: live ? live.kpi.calibrated_proficiency : sbar / n,
      flagged,
    };
  }, [cohort, live]);

  const heat = useMemo(() => {
    if (live) {
      return live.concepts.map((c) => ({
        cn: c.concept, m: c.mastery, dens: c.misconception_density, n: c.n,
      }));
    }
    return CONCEPTS.map((cn, ci) => {
      let m = 0; cohort.forEach((s) => (m += s.vec[ci])); m /= cohort.length || 1;
      return { cn, m, dens: clamp((1 - m) * 0.5, 0.02, 0.6), n: 0 };
    });
  }, [cohort, live]);

  const roster = useMemo(() => {
    let list = [...cohort].sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)]);
    if (query) { const q = query.toUpperCase(); list = list.filter((s) => s.code.indexOf(q) >= 0); }
    return list;
  }, [cohort, query]);

  const hotspots = useMemo(() => {
    if (hot) return hot.map((h) => ({ html: h.statement.replace(/\[(.*?)\]/g, '<span class="mfrag">$1</span>'), concept: h.concept, rate: h.rate, count: h.n_misconception, seen: h.n_seen, note: h.note }));
    return [...HOTSPOTS].sort((a, b) => b.rate - a.rate).slice(0, 5)
      .map((h) => ({ ...h, count: Math.round(kpis.n * h.rate), seen: kpis.n, note: "" }));
  }, [hot, kpis.n]);

  const download = useCallback(async (which: "responses" | "concept-state") => {
    setBusy(which);
    try { await api.downloadExport(which); }
    catch { setBusy("failed"); setTimeout(() => setBusy(""), 2200); return; }
    setBusy("");
  }, []);

  const scopeDesc = role === "class"
    ? <>Class teacher view — <b>every student</b> in your section across the Maths diagnostic. Spot who needs attention first.</>
    : <>Subject teacher view — <b>your subject</b> across the sections you teach. Compare mastery and misconception spread.</>;

  return (
    <div className="cx-wrap">
      <header className="cx-top">
        <div className="cx-brand"><Icon id="s-hyperion" /><div className="cx-logo">HYPER<b>ION</b></div><div className="cx-subttl">Teacher Console · {live ? "live" : "offline"}</div></div>
        <div className="cx-spacer" />
        <div className="cx-roles" role="tablist" aria-label="Teacher role">
          <button className="cx-role" role="tab" aria-selected={role === "class"} onClick={() => { setRole("class"); setSelected(null); }}><span className="g" />Class teacher</button>
          <button className="cx-role" role="tab" aria-selected={role === "subject"} onClick={() => { setRole("subject"); setSelected(null); }}><span className="g" />Subject teacher</button>
        </div>
        <button className="cx-ibtn" onClick={toggle} aria-label="Toggle theme">◐</button>
      </header>

      <div className="cx-scope">
        <span className="cx-who">{role === "class" ? `Class 7 · Section ${(live?.scope ?? mySections)[0] ?? "B"}` : "Mathematics · Class 7"}</span>
        <span className="cx-n">{kpis.n} students</span>
        <span className="cx-desc">{scopeDesc}</span>
        {/* One right-aligned tool group: two competing `margin-left:auto`
            elements collapse unpredictably when the bar wraps. */}
        <div className="cx-tools">
          {role === "subject" && (
            <div className="cx-secfilter" aria-label="Filter sections">
              {["A", "B", "C"].map((k) => (
                <button key={k} className="cx-sc" aria-pressed={secs[k]} onClick={() => setSecs((p) => {
                  const next = { ...p, [k]: !p[k] };
                  if (!next.A && !next.B && !next.C) next[k] = true;
                  return next;
                })}>7{k}</button>
              ))}
            </div>
          )}
          <div className="cx-exports">
            <button onClick={() => download("responses")} disabled={!!busy}>
              {busy === "responses" ? "Exporting…" : "Responses CSV"}
            </button>
            <button onClick={() => download("concept-state")} disabled={!!busy}>
              {busy === "concept-state" ? "Exporting…" : "Concept state CSV"}
            </button>
          </div>
        </div>
        {busy === "failed" && <span className="cx-exfail">Export needs a live server sign-in.</span>}
      </div>

      <div className="cx-kpis">
        <Kpi cls={kpis.flagged > kpis.n * 0.25 ? "bad" : "warn"} l="Need attention" v={String(kpis.flagged)} u="hardened misconceptions" />
        <Kpi cls={kpis.miscD > 0.22 ? "bad" : kpis.miscD > 0.14 ? "warn" : "good"} l="Misconception density" v={pct(kpis.miscD)} unit="%" u="confident-wrong responses" />
        <Kpi cls={kpis.sbarD > 0.4 ? "good" : kpis.sbarD > 0 ? "warn" : "bad"} l="Calibrated proficiency" v={`${kpis.sbarD >= 0 ? "+" : ""}${kpis.sbarD.toFixed(2)}`} u="mean signed score s̄" />
        <Kpi cls={kpis.invD > 0.2 ? "warn" : "good"} l="Data quality" v={100 - pct(kpis.invD)} unit="%" u="valid response-time share" />
      </div>

      <div className="cx-grid">
        <div className="cx-col">
          <section className="cx-panel">
            <div className="cx-phead"><h2>{role === "class" ? "Concept mastery — your section" : "Concept mastery — across sections"}</h2></div>
            <div className="cx-pbody">
              <div className="cx-hrow head"><span>Concept</span><span>Class mastery</span><span style={{ textAlign: "right" }}>Misc.</span><span style={{ textAlign: "right" }}>Seen</span></div>
              {heat.map((h) => {
                const dcol = h.dens > 0.3 ? "var(--misc)" : h.dens > 0.16 ? "var(--fragile)" : "var(--secure)";
                return (
                  <div key={h.cn} className="cx-hrow">
                    <div className="cx-cname"><span className="sq" />{h.cn}</div>
                    <div className="cx-mbar"><i style={{ width: `${pct(h.m)}%`, background: h.m >= 0.7 ? "var(--fill-secure)" : h.m >= 0.5 ? "var(--fill-fragile)" : "var(--fill-misc)" }} /><b>{pct(h.m)}%</b></div>
                    <div className="cx-mdens"><span className="dot" style={{ background: dcol }} />{pct(h.dens)}%</div>
                    <div className="cx-seen">{h.n || "—"}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="cx-panel">
            <div className="cx-phead"><h2>Misconception hotspots</h2><span className="hint">confident-wrong clusters — the priority signal</span></div>
            <div className="cx-pbody">
              {hotspots.length === 0 && <p className="cx-empty">No confident-wrong clusters yet.</p>}
              {hotspots.map((h, i) => (
                <div key={i} className="cx-hotrow">
                  <div className="rk">{i + 1}</div>
                  <div>
                    <div className="st" dangerouslySetInnerHTML={{ __html: h.html }} />
                    <div className="meta">
                      <span className="cx-tag">{h.concept}</span>
                      <span>{h.note || "confidently marked the wrong way"}</span>
                    </div>
                  </div>
                  <div className="cnt"><div className="n">{h.count}</div><div className="p">of {h.seen} seen · {pct(h.rate)}%</div></div>
                  <div className="cx-sevbar"><i style={{ width: `${pct(h.rate)}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          {/* Fills the left column, which otherwise ran short against a tall
              student panel — and gives a teacher the rubric next to the data
              it explains rather than in a document nobody opens. */}
          <HelpPanel />
        </div>

        <div className="cx-col">
          <section className="cx-panel">
            <div className="cx-phead"><h2>Roster</h2></div>
            <div className="cx-rsearch"><span aria-hidden="true">⌕</span>
              <input type="search" value={query} placeholder="Find a student code…" aria-label="Search students" onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="cx-roster" role="listbox" aria-label="Students">
              {roster.map((s) => {
                const st = statusOf(s);
                return (
                  <button key={s.code} className={`cx-stu s-${st}`} role="option" aria-current={s.code === selected} onClick={() => setSelected(s.code)}>
                    <span className="strip" />
                    <span className="ava" style={{ background: `linear-gradient(160deg, ${s.avc}, color-mix(in oklab, ${s.avc} 55%, #000))` }}>{s.av}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="code">{s.code}{role === "subject" ? ` · 7${s.section}` : ""}</span>
                      <span className="fp">{s.vec.map((v, i) => <i key={i} style={{ height: `${Math.max(8, v * 100)}%`, background: v > 0.66 ? "var(--fill-secure)" : v > 0.4 ? "var(--fill-fragile)" : "var(--fill-misc)" }} />)}</span>
                    </span>
                    <span className={`chip c-${st}`}>{STATUS_LABEL[st]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="cx-panel">
            <div className="cx-phead"><h2>Student</h2><span className="cx-dcode">{detail ? `${detail.code} · 7${detail.section} · ${detail.subject}` : "—"}</span></div>
            <div className="cx-pbody">
              {detail
                ? <><Detail d={detail} /><PtmRow code={detail.code} /></>
                : <p style={{ color: "var(--muted)", fontSize: 13 }}>Select a student.</p>}
            </div>
          </section>
        </div>
      </div>

      <p className="cx-foot">
        <b>Anonymous codes</b>, no PII. Figures are the <b>signed diagnostic</b>, never the game XP.
        {teacher && <> · {teacher.id}</>}
        {" "}<button onClick={() => nav("/")} style={{ background: "none", border: 0, color: "var(--red2)", cursor: "pointer", font: "inherit" }}>Sign out</button>
      </p>
    </div>
  );
}

function Kpi({ cls, l, v, unit, u }: { cls: string; l: string; v: string | number; unit?: string; u: string }) {
  return (
    <div className={`cx-kpi ${cls}`}>
      <div className="stripe" /><div className="l">{l}</div>
      <div className="v">{v}{unit && <small>{unit}</small>}</div>
      <div className="u">{u}</div>
    </div>
  );
}

/** Attach a real name to a code, then open the PTM report.
 *
 *  The only PII the system holds, and the flow is shaped so it stays that way:
 *  the teacher asks the child for their code in person, so the code-to-name
 *  link never travels through the app. Clearing the field deletes the link.
 */
function PtmRow({ code }: { code: string }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState("");

  useEffect(() => {
    setName(""); setSaved(null);
    api.report(code).then((r) => { setSaved(r.real_name); setName(r.real_name); }).catch(() => {});
  }, [code]);

  const save = async () => {
    setBusy(true);
    try {
      const out = await api.setStudentName(code, name.trim());
      setSaved(out.real_name);
    } catch { /* leave the field as typed so nothing is silently lost */ }
    setBusy(false);
  };

  return (
    <div className="cx-ptm">
      <div className="cx-dlabel">Parents' evening</div>
      <p className="cx-ptmnote">
        Ask the child for their code in person, then attach their name here. It stays in
        this console — it is never written to a research export, and clearing the box
        removes it.
      </p>
      <div className="cx-ptmrow">
        <input
          className="cx-ptmin"
          value={name}
          placeholder="Child's name (optional)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <button className="cx-ptmbtn ghost" onClick={save} disabled={busy || name.trim() === (saved ?? "")}>
          {busy ? "Saving…" : saved && name.trim() === saved ? "Saved" : "Save"}
        </button>
        <button className="cx-ptmbtn" onClick={() => nav(`/report/${encodeURIComponent(code)}`)}>
          Report card ›
        </button>
      </div>

      {/* Recovery. An anonymous instrument has no email to send a reset to, so
          the teacher is the recovery path — and that is right, because they are
          the only person who can check in the room that the child asking is the
          child who owns the code. */}
      <div className="cx-ptmrow" style={{ marginTop: 10 }}>
        <button
          className="cx-ptmbtn ghost"
          onClick={async () => {
            if (!confirm(`Clear the PIN on ${code}?\n\nThey'll be able to sign in with just their code, and can set a new PIN afterwards.`)) return;
            setPinMsg("…");
            try { await api.resetStudentPin(code); setPinMsg("PIN cleared"); }
            catch { setPinMsg("Couldn't clear it"); }
            setTimeout(() => setPinMsg(""), 3000);
          }}
        >
          Forgotten PIN — clear it
        </button>
        {pinMsg && <span className="cx-ptmmsg">{pinMsg}</span>}
      </div>
      <p className="cx-ptmnote" style={{ marginTop: 8, marginBottom: 0 }}>
        Forgotten the <b>code</b> too? Search the roster above — it filters as you type, and
        a name saved here is searchable alongside the code.
      </p>
    </div>
  );
}

function Detail({ d }: { d: StudentDetail }) {
  const over = d.calibration_bias >= 0;
  const mag = (clamp(Math.abs(d.calibration_bias), 0, 0.5) / 0.5) * 50;
  const calLbl = `${over ? "+" : ""}${d.calibration_bias.toFixed(2)} ${over ? "overconfident" : "under-confident"}`;
  const invOk = d.invalid_share <= 0.2;
  const gap = d.reification_gap;
  return (
    <>
      <div className="cx-dgrid">
        {(["SECURE", "FRAGILE", "GAP", "MISCONCEPTION"] as DiagnosticCell[]).map((cl) => (
          <div key={cl} className="cx-cellp" style={{ ["--cc" as string]: CELL_COLOR[cl] }}>
            <div className="stripe" /><div className="n">{d.cells[cl]}</div><div className="l">{cl}</div>
          </div>
        ))}
      </div>

      <div className="cx-dlabel">Calibration profile</div>
      <div className="cx-calib">
        <div className="mid" />
        <div className="fillc" style={{ left: over ? "50%" : `${50 - mag}%`, width: `${mag}%`, background: over ? "var(--misc)" : "var(--gap)" }} />
        <div className="lbl" style={over ? { right: 8 } : { left: 8 }}>{calLbl}</div>
      </div>
      <div className="cx-ends"><span>under-confident</span><span>calibrated</span><span>overconfident</span></div>

      <div className="cx-dlabel">Concept fingerprint (10-D)</div>
      <div className="cx-dfp">
        {d.fingerprint.map((f) => (
          <div key={f.concept} className={`r${f.seen ? "" : " unseen"}`}>
            <span>{f.concept}</span>
            <div className="bb"><i style={{ width: `${pct(f.mastery)}%` }} /></div>
            <span className="pc">{f.seen ? pct(f.mastery) : "—"}</span>
          </div>
        ))}
      </div>

      {d.misconceptions.length > 0 && (
        <>
          <div className="cx-dlabel">Confident-wrong answers — what to ask about</div>
          <div className="cx-dmisc">
            {d.misconceptions.slice(0, 5).map((m, i) => (
              <div key={i} className="m">
                <div className="s" dangerouslySetInnerHTML={{ __html: m.statement.replace(/\[(.*?)\]/g, '<span class="mfrag">$1</span>') }} />
                <div className="n">{m.note || `${m.concept} · ${m.axis}`}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="cx-dq">
        <div className="q"><div className="l">Signed score s̄</div><div className={`v ${d.sbar > 0.3 ? "ok" : d.sbar < 0 ? "bad" : ""}`}>{d.sbar >= 0 ? "+" : ""}{d.sbar.toFixed(2)}</div></div>
        <div className="q"><div className="l">Valid RT</div><div className={`v ${invOk ? "ok" : "bad"}`}>{100 - pct(d.invalid_share)}%</div></div>
        <div className="q"><div className="l">Mean time</div><div className="v">{d.mean_rt_ms ? `${(d.mean_rt_ms / 1000).toFixed(1)}s` : "—"}</div></div>
      </div>

      {gap.n > 0 && (
        <p className="cx-gap">
          Reification gap Δ <b>{gap.mean >= 0 ? "+" : ""}{gap.mean.toFixed(2)}</b> over {gap.n} twin pair{gap.n === 1 ? "" : "s"}
          {" "}— canonical minus perturbed. A large positive Δ points at procedure without structure.
          <span> Δ as a reification measure is still under validation.</span>
        </p>
      )}
    </>
  );
}
