// Single inline SVG symbol sprite. Mounted once at the app root; every screen
// references glyphs via <Icon id="s-..." />. No external assets (offline-safe).

export function Sprite() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="s-hyperion" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 1 2 21h20L12 1zm0 5 6 12H6l6-12z" />
          <path fill="currentColor" opacity=".6" d="M12 6 6 18l6-4V6z" />
        </symbol>
        <symbol id="s-int" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 8h6M8 5v6M14 17h6" /></symbol>
        <symbol id="s-frac" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 5 6 19" /><circle cx="8" cy="8" r="2.4" /><circle cx="16" cy="16" r="2.4" /></symbol>
        <symbol id="s-ratio" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="8" r="2.2" /><circle cx="8" cy="16" r="2.2" /><rect x="14" y="6" width="3" height="12" transform="skewX(-12)" /></symbol>
        <symbol id="s-alg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></symbol>
        <symbol id="s-eq" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 9h16M4 15h16M15 4l5 5-5 5" /></symbol>
        <symbol id="s-exp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 18 13 6" /><circle cx="18" cy="7" r="2.6" /></symbol>
        <symbol id="s-ang" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 19 19 19M5 19 5 5" /><path d="M5 12a7 7 0 0 1 7 7" strokeWidth="2" /></symbol>
        <symbol id="s-tri" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 4 21 20H3z" /></symbol>
        <symbol id="s-mens" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" /><path d="M4 4 20 20" /></symbol>
        <symbol id="s-data" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="12" width="4" height="8" /><rect x="10" y="7" width="4" height="13" /><rect x="16" y="3" width="4" height="17" /></symbol>
        <symbol id="s-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /></symbol>
        <symbol id="s-orb" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 20 9l-3 12H7L4 9z" /><path fill="#fff" opacity=".45" d="M12 2 20 9l-4 2-4-9z" /></symbol>
        <symbol id="s-chev2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></symbol>
        <symbol id="s-chev1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></symbol>
        <symbol id="s-secure" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l7 3v6c0 5-3 8-7 10-4-2-7-5-7-10V5z" /><path fill="#08070a" d="M10.5 13.5 8 11l-1.4 1.4 3.9 3.9L17 9.7 15.6 8.3z" /></symbol>
        <symbol id="s-fragile" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l7 3v6c0 5-3 8-7 10-4-2-7-5-7-10V5z" /><path d="M12 4 10 12l3 2-2 6" strokeWidth="1.6" /></symbol>
        <symbol id="s-gap" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3"><circle cx="12" cy="12" r="8" /></symbol>
        <symbol id="s-misc" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 22 20H2z" /><path fill="#08070a" d="M11 8h2v6h-2zM11 16h2v2h-2z" /></symbol>
        <symbol id="s-dt" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c2 3 1 5 3 6s4 0 5 2c-1 3-4 3-4 6 0 2 2 3 1 5-2-1-3-3-5-3s-3 2-5 3c-1-2 1-3 1-5 0-3-3-3-4-6 1-2 3-1 5-2s1-3 3-6z" /></symbol>
        <symbol id="s-crown" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z" /></symbol>
        <symbol id="s-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="8" /><rect x="3" y="13" width="8" height="8" /><rect x="13" y="13" width="8" height="8" /></symbol>
        <symbol id="s-flame" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4-2 5-2 8a2 2 0 0 0 4 0c2 2 3 4 3 6a5 5 0 0 1-10 0c0-4 4-6 5-14z" /></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ id, className, style }: { id: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}
