import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api, setTeacherToken } from "../api";
import {
  ANIMALS,
  isPinShape,
  isTeacherIdShape,
  issueTeacherId,
  makeStudentCode,
} from "../auth/ids";
import type { TeacherKind } from "../auth/types";
import "./gate.css";

type Step = "role" | "student" | "teacher" | "admin" | "adminConsole" | "launch";
const AV_COLORS = ["var(--red2)", "var(--gap)", "var(--secure)", "var(--gold)", "var(--admin)", "var(--teach)"];

/** Sign-in / onboarding gate — the three provisioning flows (plan §5.i, §10). */
export function Gate() {
  const nav = useNavigate();
  const { setSession, issued, addIssued, clearIssued } = useAuth();
  const [step, setStep] = useState<Step>("role");
  const [adminPass, setAdminPass] = useState("hyperion");
  const [launch, setLaunch] = useState<{ title: string; code?: string; pin?: string; to: string; cta: string } | null>(null);

  // issue a Teacher ID via the backend, falling back to local generation offline
  const doIssue = async (kind: TeacherKind, subject: string, sections: string[]) => {
    try {
      const r = await api.issueTeacher({ kind, subject, sections }, adminPass);
      addIssued({ id: r.teacher_id, pin: r.pin, kind: r.kind as TeacherKind, subject, sections: r.sections, label: r.label, issuedAt: new Date().toISOString() });
    } catch {
      addIssued(issueTeacherId({ kind, subject, sections }));
    }
  };

  return (
    <div className="gate">
      <header className="ghdr">
        <div className="glogo">HYPER<b>ION</b></div>
        <div className="gsub">Pre-requisite Audit · Class 7 Maths</div>
      </header>

      <div className="gpanel">
        {step === "role" && <RoleSelect onPick={setStep} />}
        {step === "student" && (
          <StudentFlow
            onBack={() => setStep("role")}
            onDone={(code, pin, returning) => {
              setSession({ role: "student", student: makeStudentCode({ classLevel: "Class 7", section: code.split("·")[1]?.slice(-1) ?? "B", subject: "Maths", avatarId: 0 }) });
              setLaunch({
                title: returning ? "Welcome back" : "Code forged",
                code: returning ? undefined : code,
                pin: returning ? undefined : pin,
                to: "/session",
                cta: "Enter HYPERION",
              });
              setStep("launch");
            }}
          />
        )}
        {step === "teacher" && (
          <TeacherFlow
            onBack={() => setStep("role")}
            onDone={(id, server) => {
              const t = issued.find((x) => x.id === id.toUpperCase());
              // Prefer what the server says about scope — it is the authority
              // on which sections this account may see (plan §5.i).
              setSession({
                role: "teacher",
                teacher: server
                  ? { id: server.teacher_id, pin: t?.pin ?? "····", kind: server.kind as TeacherKind,
                      subject: server.subject, sections: server.sections, label: server.label,
                      issuedAt: t?.issuedAt ?? new Date().toISOString(), token: server.token }
                  : t ?? { id: id.toUpperCase(), pin: "0000", kind: "class", subject: "Maths", sections: ["7B"], label: "Class 7B · all students", issuedAt: new Date().toISOString() },
              });
              setLaunch({ title: "Signed in", to: "/console", cta: "Open console" });
              setStep("launch");
            }}
          />
        )}
        {step === "admin" && (
          <AdminLogin onBack={() => setStep("role")} onOk={(pass) => { setAdminPass(pass); setStep("adminConsole"); }} />
        )}
        {step === "adminConsole" && (
          <AdminConsole
            onOut={() => { clearIssued(); setStep("role"); }}
            issued={issued}
            onIssue={doIssue}
          />
        )}
        {step === "launch" && launch && (
          <div className="glaunch">
            <h2 className="gt">{launch.title}</h2>
            {launch.code && (
              <div className="codecard">
                <div className="ck">Your student code</div>
                <div className="ccode">{launch.code}</div>
                <div className="cpin">{launch.pin ? <>PIN <b>{launch.pin}</b></> : "no PIN set"}</div>
              </div>
            )}
            <p className="gd">{launch.code ? "Remember this code — it's your only way back in." : "Access is role-scoped and ready."}</p>
            <button className="btn" onClick={() => nav(launch.to)}>{launch.cta} ▸</button>
            <button className="btn ghost" onClick={() => setStep("role")}>Switch user</button>
          </div>
        )}
      </div>

      <p className="gfoot">
        Data-minimised by design: students are anonymous codes (no PII), teachers are admin-issued IDs,
        and the admin never sees a child's real identity (plan §10).
      </p>
    </div>
  );
}

function RoleSelect({ onPick }: { onPick: (s: Step) => void }) {
  const roles: { key: Step; cls: string; title: string; blurb: string }[] = [
    { key: "student", cls: "student", title: "I'm a student", blurb: "Create your own code, or return with one" },
    { key: "teacher", cls: "teacher", title: "I'm a teacher", blurb: "Sign in with your Teacher ID" },
    { key: "admin", cls: "admin", title: "Admin", blurb: "Provision teachers & issue IDs" },
  ];
  return (
    <section>
      <div className="eyebrow">Choose how you enter</div>
      <h2 className="gt">Who's arriving?</h2>
      <p className="gd">Students make their own code; teachers use an admin-issued ID; the admin issues those IDs.</p>
      <div className="roles">
        {roles.map((r) => (
          <button key={r.key} className={`rc ${r.cls}`} onClick={() => onPick(r.key)}>
            <span className="tx"><b>{r.title}</b><span>{r.blurb}</span></span>
            <span className="go">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StudentFlow({ onBack, onDone }: { onBack: () => void; onDone: (code: string, pin: string, returning: boolean) => void }) {
  const [tab, setTab] = useState<"new" | "ret">("new");
  const [section, setSection] = useState("B");
  const [avatar, setAvatar] = useState(0);
  const [pin, setPin] = useState("");
  const [retCode, setRetCode] = useState("");
  const [err, setErr] = useState("");

  return (
    <section>
      <button className="back" onClick={onBack}>‹ Back</button>
      <div className="tabs">
        <button aria-selected={tab === "new"} onClick={() => setTab("new")}>New — make my code</button>
        <button aria-selected={tab === "ret"} onClick={() => setTab("ret")}>Returning</button>
      </div>
      {tab === "new" ? (
        <>
          <div className="eyebrow">Step 1 · your class</div>
          <h2 className="gt">Set up your code</h2>
          <p className="gd">No name, no email — ever. You'll get an anonymous code that's yours to keep.</p>
          <Field label="Section">
            <div className="opts">
              {["A", "B", "C", "D"].map((s) => (
                <button key={s} className="pick" aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>
              ))}
            </div>
          </Field>
          <Field label="Pick an avatar & call-sign">
            <div className="avatars">
              {ANIMALS.slice(0, 6).map((a, i) => (
                <button key={a} className="avp" aria-pressed={avatar === i} title={a}
                  style={{ background: `linear-gradient(150deg, ${AV_COLORS[i]}, color-mix(in oklab, ${AV_COLORS[i]} 45%, #000))` }}
                  onClick={() => setAvatar(i)}>{a.slice(0, 2)}</button>
              ))}
            </div>
          </Field>
          <Field label="Set a 4-digit PIN (optional)">
            <input className="in mono" inputMode="numeric" maxLength={4} value={pin} placeholder="••••"
              onChange={(e) => setPin(e.target.value)} />
          </Field>
          <div className="err">{err}</div>
          <button className="btn" onClick={async () => {
            if (pin && !isPinShape(pin)) { setErr("PIN must be exactly 4 digits (or blank)."); return; }
            setErr("");
            let code: string;
            try {
              code = (await api.createStudent({ section, class_level: "Class 7", subject: "Maths", avatar_id: avatar, pin: pin || undefined })).code;
            } catch {
              code = makeStudentCode({ classLevel: "Class 7", section, subject: "Maths", avatarId: avatar }).code;
            }
            onDone(code, pin, false);
          }}>Forge my code ▸</button>
        </>
      ) : (
        <>
          <div className="eyebrow">Welcome back</div>
          <h2 className="gt">Enter your code</h2>
          <Field label="Student code"><input className="in mono" value={retCode} placeholder="KESTREL·4B" onChange={(e) => setRetCode(e.target.value)} /></Field>
          <div className="err">{err}</div>
          <button className="btn" onClick={async () => {
            if (!retCode.trim()) { setErr("Enter your student code."); return; }
            setErr("");
            try { await api.loginStudent(retCode.trim(), undefined); } catch { /* offline: proceed */ }
            onDone(retCode.trim().toUpperCase(), "", true);
          }}>Enter the diagnostic ▸</button>
        </>
      )}
    </section>
  );
}

interface TeacherServerLogin {
  teacher_id: string; kind: string; subject: string; sections: string[]; label: string; token: string;
}

function TeacherFlow({ onBack, onDone }: {
  onBack: () => void;
  onDone: (id: string, server?: TeacherServerLogin) => void;
}) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  return (
    <section>
      <button className="back" onClick={onBack}>‹ Back</button>
      <div className="eyebrow">Staff sign-in</div>
      <h2 className="gt">Teacher ID</h2>
      <p className="gd">Use the ID your admin issued. It carries your role and the classes you can see.</p>
      <Field label="Teacher ID"><input className="in mono" value={id} placeholder="MATH-7B-XXXX" onChange={(e) => setId(e.target.value)} /></Field>
      <Field label="PIN"><input className="in mono" inputMode="numeric" maxLength={4} value={pin} placeholder="••••" onChange={(e) => setPin(e.target.value)} /></Field>
      <div className="err">{err}</div>
      <button className="btn" onClick={async () => {
        if (!isTeacherIdShape(id)) { setErr("That doesn't look like a Teacher ID (e.g. MATH-7B-K3Q9)."); return; }
        if (!isPinShape(pin)) { setErr("Enter your 4-digit PIN."); return; }
        setErr("");
        try {
          const server = await api.loginTeacher(id.toUpperCase(), pin);
          setTeacherToken(server.token);  // scopes every console/export call
          onDone(id, server);
        } catch (e) {
          const msg = (e as Error).message || "";
          if (/invalid|pin|401|404/i.test(msg)) { setErr("Invalid teacher ID or PIN."); return; }
          setTeacherToken(null);
          onDone(id); // network/offline: proceed against locally-issued IDs
        }
      }}>Open my console ▸</button>
      <p className="hint">No ID yet? Teachers can't self-register — ask your admin to issue one.</p>
    </section>
  );
}

function AdminLogin({ onBack, onOk }: { onBack: () => void; onOk: (pass: string) => void }) {
  const [idv, setIdv] = useState("admin");
  const [pass, setPass] = useState("hyperion");
  const [err, setErr] = useState("");
  return (
    <section>
      <button className="back" onClick={onBack}>‹ Back</button>
      <div className="eyebrow">Restricted</div>
      <h2 className="gt">Admin sign-in</h2>
      <Field label="Admin ID"><input className="in mono" value={idv} onChange={(e) => setIdv(e.target.value)} /></Field>
      <Field label="Passcode"><input className="in mono" type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
      <div className="err">{err}</div>
      <button className="btn" onClick={() => { if (idv.trim() !== "admin") { setErr("Wrong admin ID or passcode."); return; } onOk(pass); }}>Sign in ▸</button>
    </section>
  );
}

function AdminConsole({ onOut, issued, onIssue }: {
  onOut: () => void;
  issued: ReturnType<typeof useAuth>["issued"];
  onIssue: (kind: TeacherKind, subject: string, sections: string[]) => void;
}) {
  const [kind, setKind] = useState<TeacherKind>("class");
  const [subject] = useState("Maths");
  const [section, setSection] = useState("7B");
  const [sections, setSections] = useState<string[]>(["7A", "7B"]);
  const [err, setErr] = useState("");
  const allSecs = useMemo(() => ["7A", "7B", "7C", "7D"], []);

  return (
    <section>
      <button className="back" onClick={onOut}>‹ Sign out</button>
      <div className="eyebrow">Admin console</div>
      <h2 className="gt">Issue a Teacher ID</h2>
      <Field label="Role type">
        <div className="opts">
          {(["class", "subject"] as TeacherKind[]).map((k) => (
            <button key={k} className="pick" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "class" ? "Class teacher" : "Subject teacher"}
            </button>
          ))}
        </div>
      </Field>
      {kind === "class" ? (
        <Field label="Section (class teacher owns one)">
          <div className="opts">
            {allSecs.map((s) => <button key={s} className="pick" aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>)}
          </div>
        </Field>
      ) : (
        <Field label="Sections this subject teacher sees">
          <div className="opts">
            {allSecs.map((s) => (
              <button key={s} className="pick" aria-pressed={sections.includes(s)}
                onClick={() => setSections((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}>{s}</button>
            ))}
          </div>
        </Field>
      )}
      <div className="err">{err}</div>
      <button className="btn" onClick={() => {
        try {
          onIssue(kind, subject, kind === "class" ? [section] : sections);
          setErr("");
        } catch (e) { setErr((e as Error).message); }
      }}>Generate Teacher ID ▸</button>

      <div className="issued">
        <div className="ih">Issued this session <span>{issued.length}</span></div>
        {issued.length === 0 ? <p className="empty">No IDs issued yet.</p> : issued.map((t) => (
          <div key={t.id} className={`tid ${t.kind}`}>
            <span className="badge">{t.kind === "class" ? "Class" : "Subject"}</span>
            <span className="id">{t.id}</span>
            <span className="scope">{t.label}</span>
            <span className="tpin">PIN {t.pin}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
