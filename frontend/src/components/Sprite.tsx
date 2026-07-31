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
        <symbol id="s-int" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14h18M6 11l-3 3 3 3M18 11l3 3-3 3M12 9v10" /></symbol>
        <symbol id="s-frac" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><circle cx="12" cy="6.6" r="2.1" /><circle cx="12" cy="17.4" r="2.1" /></symbol>
        <symbol id="s-ratio" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.5 5.5 5.5 18.5" /><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="16" r="2.6" /></symbol>
        <symbol id="s-alg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 4.5c-2.6 3-2.6 12 0 15M15.5 4.5c2.6 3 2.6 12 0 15M9.8 9.5l4.4 5M14.2 9.5l-4.4 5" /></symbol>
        <symbol id="s-eq" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5h16M4 14.5h16" /></symbol>
        <symbol id="s-exp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="10.5" width="10" height="10" rx="1" /><rect x="15.5" y="3.5" width="6" height="6" rx="1" /></symbol>
        <symbol id="s-ang" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19h14M5 19V5" /><path d="M5 12.5a6.5 6.5 0 0 1 6.5 6.5" /></symbol>
        <symbol id="s-tri" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5 20.5 19.5H3.5z" /></symbol>
        <symbol id="s-mens" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4" width="17" height="11" rx="1" /><path d="M3.5 19.5h17M3.5 18v3M20.5 18v3" /></symbol>
        <symbol id="s-data" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 20h17M7 20v-5.5M12 20v-11M17 20v-8" /></symbol>
        <symbol id="s-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /></symbol>
        <symbol id="s-orb" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 20 9l-3 12H7L4 9z" /><path fill="#fff" opacity=".45" d="M12 2 20 9l-4 2-4-9z" /></symbol>
        <symbol id="s-chev2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></symbol>
        <symbol id="s-chev1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></symbol>
        {/* three tiers of chevron, one per confidence band: 1 = hedged,
            2 = fairly sure, 3 = sure. The count *is* the certainty cue. */}
        <symbol id="s-chev3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6l-5 6 5 6M15.5 6l-5 6 5 6M23 6l-5 6 5 6" /></symbol>
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
