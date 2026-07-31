/* The gate's pixel bat — sprite art in pure CSS, no image asset.
 *
 * Three nested elements, each owning exactly one job, because the sprite needs
 * `transform` for its own scale() and anything else animating transform on the
 * same node would fight it:
 *
 *   .pbat-wrap   fixed box that reserves the layout space
 *   .pbat-hover  the arrival swoop and the idle drift
 *   .pbat        the sprite, scale() only
 *
 * The neon lives in the sprite's own pixels (white body, purple rim, yellow
 * eyes) — there is deliberately no glow layer behind it.
 *
 * Decorative: aria-hidden, and pointer-events are off in CSS so it can never
 * intercept a tap meant for the sign-in panel below it.
 */
import "./pixelbat.css";

export function PixelBat() {
  return (
    <div className="pbat-wrap" aria-hidden="true">
      <div className="pbat-hover">
        <div className="pbat" />
      </div>
    </div>
  );
}
