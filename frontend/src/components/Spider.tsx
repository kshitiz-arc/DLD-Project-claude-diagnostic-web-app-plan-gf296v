/* Radar / spider chart for the ten-concept mastery fingerprint.
 *
 * Hand-drawn SVG rather than a chart library: the lab may be air-gapped, so
 * nothing may be fetched at runtime, and a radar is little more than polar
 * arithmetic. It also lets the plot say things a generic chart cannot —
 * notably drawing *evidence* separately from *mastery*.
 *
 * Reading it:
 *   - the filled polygon is mastery per concept, 0 at the centre, 1 at the rim
 *   - the dashed ring is the 0.62 "developing" line, so a shape that stays
 *     inside it is visibly not yet secure
 *   - an axis whose evidence is thin is dimmed and marked, because a spike
 *     built on one item is not the same claim as a spike built on four, and a
 *     radar chart otherwise hides that difference completely
 */

import "./spider.css";

export interface SpiderAxis {
  label: string;
  /** 0..1 */
  value: number;
  /** How many items back this axis. Under 2 is drawn as provisional. */
  evidence?: number;
  /** Optional second series (e.g. the cohort mean) drawn as an outline. */
  compare?: number;
}

interface Props {
  axes: SpiderAxis[];
  size?: number;
  /** Label for the compare series, if any. */
  compareLabel?: string;
}

const SHORT: Record<string, string> = {
  "Integers": "Int",
  "Fractions": "Frac",
  "Ratio & %": "Ratio",
  "Algebra": "Alg",
  "Equations": "Eqn",
  "Exponents": "Exp",
  "Lines & Angles": "Angle",
  "Triangles": "Tri",
  "Mensuration": "Mens",
  "Data Handling": "Data",
};

export function Spider({ axes, size = 320, compareLabel }: Props) {
  const n = axes.length;
  if (n < 3) return null;

  const pad = 46;                       // room for the outside labels
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Start at 12 o'clock and go clockwise, which is how people read a dial.
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i: number, v: number) => {
    const a = angle(i);
    const rad = r * Math.max(0, Math.min(1, v));
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as const;
  };
  const poly = (vals: number[]) =>
    vals.map((v, i) => at(i, v).join(",")).join(" ");

  const rings = [0.25, 0.5, 0.75, 1];
  const hasCompare = axes.some((a) => typeof a.compare === "number");

  return (
    <svg
      className="spider"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Mastery by concept: ${axes.map((a) => `${a.label} ${Math.round(a.value * 100)}%`).join(", ")}`}
    >
      {/* web */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          className="sp-ring"
          points={poly(axes.map(() => ring))}
        />
      ))}
      {axes.map((a, i) => {
        const [x, y] = at(i, 1);
        return <line key={a.label} className="sp-spoke" x1={cx} y1={cy} x2={x} y2={y} />;
      })}

      {/* the "developing" threshold — the line a shape has to clear */}
      <polygon className="sp-threshold" points={poly(axes.map(() => 0.62))} />

      {hasCompare && (
        <polygon
          className="sp-compare"
          points={poly(axes.map((a) => a.compare ?? 0))}
        />
      )}

      <polygon className="sp-fill" points={poly(axes.map((a) => a.value))} />

      {axes.map((a, i) => {
        const [x, y] = at(i, a.value);
        const thin = (a.evidence ?? 99) < 2;
        return (
          <circle
            key={a.label}
            className={`sp-node${thin ? " thin" : ""}`}
            cx={x} cy={y} r={thin ? 3 : 4}
          />
        );
      })}

      {axes.map((a, i) => {
        const [x, y] = at(i, 1.17);
        const thin = (a.evidence ?? 99) < 2;
        // Anchor by hemisphere so labels lean away from the plot.
        const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        return (
          <text
            key={a.label}
            className={`sp-label${thin ? " thin" : ""}`}
            x={x} y={y} textAnchor={anchor} dominantBaseline="middle"
          >
            {SHORT[a.label] ?? a.label}
            {thin && <tspan className="sp-thin-mark"> ?</tspan>}
          </text>
        );
      })}

      {compareLabel && (
        <text className="sp-legend" x={cx} y={size - 6} textAnchor="middle">
          outline = {compareLabel}
        </text>
      )}
    </svg>
  );
}
