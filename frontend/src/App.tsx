import { Navigate, Route, Routes } from "react-router-dom";
import { Sprite } from "./components/Sprite";
import { Gate } from "./pages/Gate";
import { Session } from "./session/Session";
import { Console } from "./console/Console";

// Route map mirrors the three actors (plan §1, §5.i):
//   /            -> sign-in / onboarding gate
//   /session     -> student diagnostic (HYPERION combat HUD)
//   /console     -> teacher console (role-scoped)
export function App() {
  return (
    <>
      <Sprite />
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route path="/session" element={<Session />} />
        <Route path="/console" element={<Console />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
