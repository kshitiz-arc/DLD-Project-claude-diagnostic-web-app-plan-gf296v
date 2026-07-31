import { Navigate, Route, Routes } from "react-router-dom";
import { Sprite } from "./components/Sprite";
import { Gate } from "./pages/Gate";
import { Range } from "./range/Range";
import { Session } from "./session/Session";
import { Console } from "./console/Console";
import { Report } from "./console/Report";

// Route map mirrors the three actors (plan §1, §5.i):
//   /            -> sign-in / onboarding gate
//   /range       -> optional warm-up, outside the instrument (not assessed)
//   /session     -> student diagnostic (HYPERION combat HUD)
//   /console     -> teacher console (role-scoped)
export function App() {
  return (
    <>
      <Sprite />
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route path="/range" element={<Range />} />
        <Route path="/session" element={<Session />} />
        <Route path="/console" element={<Console />} />
        {/* Shareable per-child report for a parents' evening. Its own route so
            a teacher can hand over one link without exposing the console. */}
        <Route path="/report/:code" element={<Report />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
