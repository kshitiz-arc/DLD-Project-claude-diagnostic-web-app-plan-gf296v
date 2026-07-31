import { useCallback, useEffect, useRef } from "react";
import { prefersReducedMotion } from "../hooks/useTheme";

interface Part { x: number; y: number; vx: number; vy: number; life: number; c: string; }

function resolveColor(c: string): string {
  const m = c.match(/var\((--[\w-]+)/);
  if (m) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return v || "#fff";
  }
  return c;
}

/** Canvas hit-spark system. Returns a canvas ref and an imperative burst(). */
export function useParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parts = useRef<Part[]>([]);
  const reduce = useRef(prefersReducedMotion());

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || reduce.current) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const arr = parts.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.97; p.life -= 0.025;
        if (p.life <= 0) { arr.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.x * 0.05);
        const s = 4 + p.life * 3;
        ctx.fillRect(-2, -2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  const burst = useCallback((x: number, y: number, color: string, n: number) => {
    if (reduce.current) return;
    const c = resolveColor(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const sp = 2 + Math.random() * 7;
      parts.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, c });
    }
  }, []);

  return { canvasRef, burst };
}
