/* Per-student report card, for a parents' evening.
 *
 * Framed for a parent, not a researcher. Three rules shaped it:
 *
 *   1. Effort and attainment are shown apart. A child who has ground for hours
 *      should be visible as such even when mastery is still thin; merging the
 *      two is how a diagnostic quietly becomes a ranking.
 *   2. Confident-wrong answers are presented as "worth a conversation", not as
 *      mistakes. They are the most useful thing the instrument finds and the
 *      easiest thing for a parent to misread as carelessness.
 *   3. Thin evidence says so. A concept seen once is labelled provisional
 *      rather than reported as a finding — a report card that overclaims is
 *      worse than one that admits what it does not know.
 *
 * There is no cohort rank anywhere on this page, deliberately: the instrument
 * measures what a child believes, and turning that into a position in a class
 * is exactly the use it was built to avoid.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Spider } from "../components/Spider";
import { api, type StudentReport } from "../api";
import "./report.css";

const BAND_CLASS: Record<string, string> = {
  "Secure": "ok",
  "Developing": "mid",
  "Needs attention": "warn",
  "Priority": "bad",
};

export function Report() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState<StudentReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.report(code)
      .then((d) => { if (!cancelled) setR(d); })
      .catch(() => { if (!cancelled) setErr("Could not load this report."); });
    return () => { cancelled = true; };
  }, [code]);

  if (err) return <div className="rp"><p className="rp-empty">{err}</p></div>;
  if (!r) return <div className="rp"><p className="rp-empty">Loading…</p></div>;

  const when = new Date(r.generated_at).toLocaleDateString(undefined,
    { day: "numeric", month: "long", year: "numeric" });
  const axes = r.concepts.map((c) => ({
    label: c.concept, value: c.mastery, evidence: c.items_seen,
  }));
  const thin = r.concepts.filter((c) => c.evidence === "thin").length;

  return (
    <div className="rp">
      <div className="rp-bar no-print">
        <button className="rp-btn ghost" onClick={() => nav("/console")}>‹ Console</button>
        <div className="rp-spacer" />
        <button className="rp-btn" onClick={() => window.print()}>Save as PDF / print</button>
      </div>

      <article className="rp-sheet">
        <header className="rp-head">
          <div>
            <div className="rp-kicker">HYPERION · Class 7 Maths · pre-requisite diagnostic</div>
            <h1 className="rp-name">{r.real_name || r.code}</h1>
            <div className="rp-meta">
              {r.real_name && <span className="rp-code">{r.code}</span>}
              <span>{r.class_level} · Section {r.section}</span>
              <span>{when}</span>
            </div>
          </div>
        </header>

        <section className="rp-lead">
          <p>
            This is a <b>diagnostic</b>, not a test score. It measures what {r.real_name || "your child"} believes
            about each topic and <b>how sure they are</b> — so we can tell the difference between
            something not yet learned and something learned the wrong way round. There is no
            pass mark and no class position.
          </p>
        </section>

        <section className="rp-block">
          <h2>Effort</h2>
          <div className="rp-effort">
            <div><b>{r.history.sessions_started}</b><span>sittings taken</span></div>
            <div><b>{r.history.test_hours.toFixed(1)}h</b><span>in the diagnostic</span></div>
            <div><b>{r.history.range_hours.toFixed(1)}h</b><span>practising on RANGE</span></div>
            <div><b>{r.history.total_hours.toFixed(1)}h</b><span>total time on task</span></div>
          </div>
          <p className="rp-fine">
            Shown separately from the results on purpose. Effort and current mastery are
            different things, and a child can have plenty of one while still building the other.
          </p>
        </section>

        <section className="rp-block rp-split">
          <div>
            <h2>Where things stand</h2>
            <Spider axes={axes} />
            <p className="rp-fine">
              Further from the centre is more secure. The dashed ring marks the
              "developing" line.
            </p>
          </div>
          <div>
            <h2>By topic</h2>
            <table className="rp-table">
              <thead>
                <tr><th>Topic</th><th>Standing</th><th>Seen</th></tr>
              </thead>
              <tbody>
                {r.concepts.map((c) => (
                  <tr key={c.concept} className={c.evidence === "thin" ? "thin" : ""}>
                    <td>{c.concept}</td>
                    <td><span className={`rp-band ${BAND_CLASS[c.band] ?? ""}`}>{c.band}</span></td>
                    <td className="num">
                      {c.items_seen}
                      {c.evidence === "thin" && <span className="rp-prov" title="Too few questions to be confident yet"> provisional</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {thin > 0 && (
              <p className="rp-fine">
                {thin} topic{thin > 1 ? "s were" : " was"} seen fewer than twice, so
                {thin > 1 ? " those standings are" : " that standing is"} provisional — a
                further sitting would firm {thin > 1 ? "them" : "it"} up.
              </p>
            )}
          </div>
        </section>

        {r.talking_points.length > 0 && (
          <section className="rp-block">
            <h2>Worth a conversation</h2>
            <p className="rp-sub">
              These are answers {r.real_name || "your child"} gave <b>confidently</b> that
              turned out not to hold. That is genuinely useful: a firmly-held wrong idea is
              easy to fix once spotted, and much harder to spot in ordinary marking. It is
              not carelessness.
            </p>
            <ul className="rp-points">
              {r.talking_points.map((p, i) => (
                <li key={i}>
                  <span className="rp-pc">{p.concept}</span>
                  <span className="rp-ps">{p.statement}</span>
                  {p.note && <span className="rp-pn">{p.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rp-block rp-split">
          <div>
            <h2>Strengths to build on</h2>
            {r.strengths.length
              ? <ul className="rp-list ok">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              : <p className="rp-fine">Nothing is comfortably secure yet — that is normal this early.</p>}
          </div>
          <div>
            <h2>Where to put the time</h2>
            {r.priorities.length
              ? <ul className="rp-list warn">{r.priorities.map((s) => <li key={s}>{s}</li>)}</ul>
              : <p className="rp-fine">No clear priorities — the picture is even across topics.</p>}
          </div>
        </section>

        <footer className="rp-foot">
          <p>
            Generated {when} from {r.valid} valid responses across {r.history.sessions_started} sitting
            {r.history.sessions_started === 1 ? "" : "s"}.
            {r.attempted > r.valid && ` ${r.attempted - r.valid} answer${r.attempted - r.valid === 1 ? " was" : "s were"} too fast to count and were excluded.`}
          </p>
          <p className="rp-fine">
            HYPERION diagnoses; it does not teach or rank. Questions about this report go to
            the class teacher.
          </p>
        </footer>
      </article>
    </div>
  );
}
