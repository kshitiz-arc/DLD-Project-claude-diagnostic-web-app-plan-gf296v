// Scale-anchoring onboarding (plan §8).
//
// "Somewhat true/false" is interpreted inconsistently by 12-year-olds, which
// is a measurement problem, not a UI one: if the hedge bins mean different
// things to different children, the confidence signal stops being comparable.
// One practice item anchors the four bins before anything is recorded. The
// practice answer is deliberately NOT sent to the server — it is calibration
// for the child, not data.
import { useState } from "react";
import { Icon } from "../components/Sprite";
import { renderStatement } from "./items";
import type { ResponseOption } from "../scoring";

const PRACTICE = "A square has [four] equal sides.";

const BINS: { r: ResponseOption; cls: string; icon: string; flip: boolean; label: string; sub: string; gloss: string }[] = [
  { r: "AF", cls: "f far", icon: "s-chev2", flip: false, label: "Always False", sub: "Sure",
    gloss: "You're sure it's wrong." },
  { r: "SF", cls: "f", icon: "s-chev1", flip: false, label: "Maybe False", sub: "Unsure",
    gloss: "You lean towards wrong, but you'd not bet on it." },
  { r: "ST", cls: "t", icon: "s-chev1", flip: true, label: "Maybe True", sub: "Unsure",
    gloss: "You lean towards right, but you'd not bet on it." },
  { r: "AT", cls: "t far", icon: "s-chev2", flip: true, label: "Always True", sub: "Sure",
    gloss: "You're sure it's right." },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<ResponseOption | null>(null);
  const chosen = BINS.find((b) => b.r === picked);
  const honest = picked === "AT";

  return (
    <div className="sx-tut">
      <div className="sx-tut-eyebrow">Before we start · how the four buttons work</div>
      <p className="sx-statement" dangerouslySetInnerHTML={{ __html: renderStatement(PRACTICE) }} />

      <div className="sx-spectrum" role="group" aria-label="Practice answer">
        {BINS.map((b) => (
          <button key={b.r} className={`sx-opt ${b.cls}${picked === b.r ? " picked" : ""}`}
            onClick={() => setPicked(b.r)} aria-pressed={picked === b.r}>
            <Icon id={b.icon} style={b.flip ? { transform: "scaleX(-1)" } : undefined} />
            <span className="k">{b.label}</span><span className="sub">{b.sub}</span>
          </button>
        ))}
      </div>
      <div className="sx-scale"><span>Certainly false</span><span className="mid">50 / 50</span><span>Certainly true</span></div>

      <div className="sx-tut-body">
        {!picked ? (
          <>
            <p className="sx-tut-lead">The outer buttons mean <b>sure</b>. The inner two mean <b>not sure</b>.</p>
            <ul className="sx-tut-list">
              {BINS.map((b) => <li key={b.r}><b>{b.label}</b> — {b.gloss}</li>)}
            </ul>
            <p className="sx-tut-note">Pick one for the practice statement above to carry on.</p>
          </>
        ) : (
          <>
            <p className="sx-tut-lead">
              You chose <b>{chosen?.label}</b>. {honest
                ? "That one's a definition, so being sure is exactly right."
                : "Fair enough — but a square is defined as having four equal sides, so \"Always True\" fits."}
            </p>
            <p className="sx-tut-rule">
              The one rule worth knowing: <b>saying you're sure when you're wrong costs you the most</b>.
              Saying you're unsure when you're unsure costs you almost nothing. So answer honestly —
              guessing confidently is the only way to actually lose ground.
            </p>
            <p className="sx-tut-note">
              Nothing you did here is recorded. Your practice answer isn't part of your results.
            </p>
            <button className="sx-btn" onClick={onDone}>Got it — begin ▸</button>
          </>
        )}
      </div>
    </div>
  );
}
