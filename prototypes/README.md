# Interactive UI Prototypes

Self-contained, single-file HTML prototypes of the HYPERION interface. Open any of
them directly in a browser — no build step, no dependencies, all assets inline.
They are the **design & interaction reference** for porting into the React app
(`../frontend`), and each wires the real scoring math from plan §5.

| File | Screen | What it demonstrates |
|---|---|---|
| `gate.html` | Sign-in / onboarding | Three provisioning flows — admin issues Teacher IDs, teachers log in, students self-create an anonymous code (class → section → subject → call-sign + PIN). |
| `hyperion.html` | Student diagnostic | Full DMC5-style combat HUD: draining Style Gauge with rank sigils (D→SSS), Devil-Trigger meter, red-orb XP, custom SVG symbols, hit-sparks, RT anti-rush gate, and the 2×2 cell verdict. |
| `teacher.html` | Teacher console | Role-scoped class-wise diagnostics — class-teacher (one section) vs subject-teacher (subject across sections), KPI strip, concept heatmap, misconception hotspots, roster + per-student fingerprint. Toggle the **Diagnostic lens** on `hyperion.html` to see the same two-score separation from the student side. |

## Design system

Dark-committed DMC5 "combat HUD" world: violet-ink/black grounds, blood-red
accent, Impact/Haettenschweiler condensed display type skewed for the kinetic
fighting-game feel, monospace for all data. Semantic diagnostic colours
(Secure / Fragile / Gap / Misconception) are kept separate from the red accent.
Each screen also carries a working light theme (the ◐ toggle) and respects
`prefers-reduced-motion`.

All three share the tokens ported to `../frontend/src/styles/tokens.css`.
