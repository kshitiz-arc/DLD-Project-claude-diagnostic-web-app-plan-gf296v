/* "How to read this" — the console's built-in manual.
 *
 * Two jobs at once. It explains every statistic and the full marking rubric so
 * a teacher can act on the data instead of trusting it; and it fills the left
 * column, which otherwise ran short against a tall student panel.
 *
 * Written to be read by a teacher, not a statistician. Every number the
 * console can show is listed with what it means, what moves it, and — the part
 * that actually matters in a staffroom — how it can mislead you.
 *
 * The values here are the shipped ones. If a constant changes in
 * `encoding.py`, `scoring.py` or `adaptive.py`, it has to change here too:
 * a manual that quietly goes stale is worse than no manual.
 */
import { useState } from "react";

interface Row { term: string; means: string; watch?: string; }

const CELLS: { name: string; cls: string; what: string; do_: string }[] = [
  {
    name: "Secure", cls: "ok",
    what: "Right, and said with conviction. The child holds the idea and knows they hold it.",
    do_: "Nothing. Move on — re-teaching here wastes everyone's time.",
  },
  {
    name: "Fragile", cls: "mid",
    what: "Right, but hedged. The answer landed; the confidence did not.",
    do_: "Worth a nudge. Usually it is knowledge that has not been used enough to feel certain.",
  },
  {
    name: "Gap", cls: "warn",
    what: "Wrong, and hedged. There is nothing there yet — an absence, not an error.",
    do_: "Teach it. This is ordinary unfamiliarity and responds to normal instruction.",
  },
  {
    name: "Misconception", cls: "bad",
    what: "Wrong, and said with conviction. A rule is present and it is the wrong rule.",
    do_: "The priority. This does not fix itself with practice — practice reinforces it. It has to be surfaced and contradicted directly.",
  },
];

const SCALE: { opt: string; label: string; phat: string; band: string; brier: string }[] = [
  { opt: "AT", label: "Always True",   phat: "0.95", band: "sure",        brier: "+0.995" },
  { opt: "MT", label: "Mostly True",   phat: "0.80", band: "fairly sure", brier: "+0.920" },
  { opt: "ST", label: "Maybe True",    phat: "0.62", band: "hedge",       brier: "+0.711" },
  { opt: "SF", label: "Maybe False",   phat: "0.38", band: "hedge",       brier: "+0.231" },
  { opt: "MF", label: "Mostly False",  phat: "0.20", band: "fairly sure", brier: "−0.280" },
  { opt: "AF", label: "Always False",  phat: "0.05", band: "sure",        brier: "−0.805" },
];

const STATS: Row[] = [
  {
    term: "Mastery",
    means: "The posterior mean of a Beta-Bernoulli over direction-correct answers in that concept. An unseen concept sits at 0.50, not 0 — no evidence is not the same as evidence of failure.",
    watch: "Read it with the item count. 0.75 off two items and 0.75 off eight are not the same claim.",
  },
  {
    term: "Evidence / items seen",
    means: "How many valid responses back that concept this sitting. Under 2 is shown as provisional throughout the console and the report card.",
    watch: "A dramatic spike on one item is noise. Run another sitting before acting on it.",
  },
  {
    term: "Signed s̄",
    means: "Mean signed Brier reward across valid responses, on −1 to +1. Positive means answers were better than a coin flip once confidence is taken into account.",
    watch: "It is not a percentage and not a mark. A child can be net-positive while holding one serious misconception.",
  },
  {
    term: "Calibration bias",
    means: "Mean confidence minus mean correctness. Positive = over-confident (surer than they should be), negative = under-confident.",
    watch: "Near zero is the goal, not high. An under-confident child who knows the material is a different conversation from one who does not.",
  },
  {
    term: "Misconception density",
    means: "Share of that concept's valid responses landing in the confident-wrong cell.",
    watch: "The single most actionable number on this screen. Rank your teaching time by it.",
  },
  {
    term: "Invalid share (rushed)",
    means: "Responses faster than that item's own reading floor — the time it physically takes to read the statement. They score nothing and move no posterior.",
    watch: "Above about 20% the whole sitting is suspect. Ask why: bored, rushed by the bell, or a child who cannot read the statements.",
  },
  {
    term: "Reification gap",
    means: "Score on canonical items minus score on their perturbed twins — the same idea wearing different surface features.",
    watch: "A large gap means procedure without understanding: fluent on the familiar form, lost when it is dressed differently.",
  },
  {
    term: "Convergence / variance",
    means: "Posterior variance per concept. The adaptive selector stops probing a concept once it drops below 0.02, because more items would buy no information.",
    watch: "High variance late in a sitting means the child was inconsistent there, not that the instrument failed.",
  },
];

const EFFORT: Row[] = [
  { term: "Sittings", means: "Diagnostic sessions started. A child may re-sit; each is recorded separately." },
  { term: "Time in the test", means: "Summed from actual response times in the event store, not wall-clock — a child who walked away is not credited for it." },
  { term: "Time on RANGE", means: "The warm-up zone. Its content is deliberately outside the assessed topics, so practising there cannot inflate the diagnostic." },
  { term: "Total grind / title", means: "Time on task only. It reads off hours, never off anything measured, so climbing it is not evidence of mastery — and cannot be mistaken for it." },
];

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [on, setOn] = useState(open);
  return (
    <div className={`hp-sec${on ? " on" : ""}`}>
      <button className="hp-sum" onClick={() => setOn((v) => !v)} aria-expanded={on}>
        <span>{title}</span><span className="hp-chev">{on ? "−" : "+"}</span>
      </button>
      {on && <div className="hp-body">{children}</div>}
    </div>
  );
}

export function HelpPanel() {
  return (
    <section className="cx-panel">
      <div className="cx-phead">
        <h2>How to read this</h2>
        <span className="cx-dcode">statistics &amp; marking rubric</span>
      </div>
      <div className="cx-pbody hp">
        <p className="hp-lead">
          HYPERION measures <b>what a child believes and how strongly</b> — not how many they
          got right. Two answers can both be wrong and mean completely different things. That
          distinction is the whole instrument, and it is what the rubric below encodes.
        </p>

        <Section title="The marking rubric — the four cells" open>
          <p className="hp-note">
            Every valid answer lands in exactly one cell, from two facts: was the direction
            right, and was it said with conviction.
          </p>
          <div className="hp-cells">
            {CELLS.map((c) => (
              <div key={c.name} className={`hp-cell ${c.cls}`}>
                <div className="hp-cn">{c.name}</div>
                <div className="hp-cw">{c.what}</div>
                <div className="hp-cd"><b>What to do:</b> {c.do_}</div>
              </div>
            ))}
          </div>
          <p className="hp-note">
            <b>Gap and Misconception are not degrees of the same thing.</b> A gap is empty
            space and fills with teaching. A misconception is occupied space and has to be
            cleared first — which is why practice alone tends to make it worse.
          </p>
        </Section>

        <Section title="The six-point scale and what each answer scores">
          <p className="hp-note">
            Each option is read as a probability the statement is true (p̂). Scoring uses a
            strictly-proper rule, <span className="hp-mono">s = 1 − 2(p̂ − y)²</span>, which
            means a child maximises their score only by reporting what they actually believe.
            Bluffing confidence loses more than it gains — that is a mathematical property,
            not a house rule.
          </p>
          <table className="hp-tab">
            <thead><tr><th>Answer</th><th>p̂</th><th>Band</th><th>Score if true</th></tr></thead>
            <tbody>
              {SCALE.map((s) => (
                <tr key={s.opt}>
                  <td><b>{s.opt}</b> <span className="hp-dim">{s.label}</span></td>
                  <td className="hp-mono">{s.phat}</td>
                  <td className="hp-dim">{s.band}</td>
                  <td className={`hp-mono ${s.brier.startsWith("−") ? "neg" : "pos"}`}>{s.brier}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hp-note">
            There is deliberately <b>no 50/50 option</b>. A midpoint is a free dodge and
            carries no direction, so it could never populate the confident-wrong cell.
            "Fairly sure" counts as confident: a child answering <b>Mostly False</b> on a true
            statement is not unsure, they are wrong and fairly sure of it.
          </p>
        </Section>

        <Section title="Every statistic, and how it can mislead you">
          <dl className="hp-dl">
            {STATS.map((s) => (
              <div key={s.term}>
                <dt>{s.term}</dt>
                <dd>
                  {s.means}
                  {s.watch && <span className="hp-watch"><b>Careful:</b> {s.watch}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Effort figures (kept apart from attainment)">
          <dl className="hp-dl">
            {EFFORT.map((s) => (
              <div key={s.term}><dt>{s.term}</dt><dd>{s.means}</dd></div>
            ))}
          </dl>
          <p className="hp-note">
            Effort and mastery are reported separately on purpose. Merging them is how a
            diagnostic turns into a ranking, and a ranking is the one use this instrument was
            built to avoid.
          </p>
        </Section>

        <Section title="How a sitting is put together">
          <ul className="hp-ul">
            <li><b>15 items</b> per sitting, at most <b>4 per concept</b>. Across ten concepts that is one or two items each, so read the fingerprint as a <b>screen</b>, not a verdict — most concepts will be flagged provisional, and that flag is honest.</li>
            <li>The first <b>3 items are the hardest available</b>, one per concept, while the child is freshest — an easy item almost everyone clears and so moves no posterior.</li>
            <li>After that the selector picks whichever concept it is <b>least certain</b> about.</li>
            <li>A confident-wrong answer triggers a <b>deeper probe</b>: first the perturbed twin of the item missed, then the same sub-skill, then the concept.</li>
            <li>Sittings stop at the cap, on <b>convergence</b> (nothing left to learn from more items), or when the bank is exhausted. A child may also <b>end early</b> — that is recorded as "abandoned" and the answers given still count.</li>
          </ul>
        </Section>

        <Section title="Two scores, and why they never mix">
          <p className="hp-note">
            Each answer produces an internal <b>signed diagnostic score</b> that drives every
            analytic here, and a separate, floored <b>XP</b> that drives the game layer the
            child sees. They are never combined. If gamification could move the measurement,
            the measurement would be worth nothing — so the red orbs, ranks and Devil Trigger
            on the student's screen have no path into any number on this console.
          </p>
        </Section>
      </div>
    </section>
  );
}
