// ID / code generation (plan §5.i, §10). Pure, dependency-free, unit-testable.
import type { StudentCode, TeacherId, TeacherKind } from "./types";

export const ANIMALS = [
  "KESTREL", "FALCON", "OTTER", "LYNX", "MOTH", "HERON", "VIPER", "CRANE",
  "WREN", "ORYX", "IBIS", "MERLIN", "FINCH", "ROOK", "JAY", "KITE", "LARK",
];

// Ambiguity-free alphabet (no O/0, I/1) so codes are easy to read aloud.
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function token(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[randInt(ALPHA.length)];
  return s;
}

export function makePin(): string {
  return String(1000 + randInt(9000));
}

const SUBJECT_PREFIX: Record<string, string> = { Maths: "MATH", Science: "SCI" };

/** Admin issues a teacher credential scoped to a role. */
export function issueTeacherId(params: {
  kind: TeacherKind;
  subject: string;
  sections: string[]; // class teacher passes exactly one
}): TeacherId {
  const { kind, subject, sections } = params;
  if (sections.length === 0) throw new Error("at least one section required");
  if (kind === "class" && sections.length !== 1) {
    throw new Error("a class teacher owns exactly one section");
  }
  const prefix = SUBJECT_PREFIX[subject] ?? "SUBJ";
  const secPart = sections.map((s) => s.replace(/^7/, "")).join("");
  const id = `${prefix}-${secPart}-${token(4)}`;
  const label =
    kind === "class"
      ? `Class ${sections[0]} · all students`
      : `${subject} · ${sections.join(" ")}`;
  return {
    id,
    pin: makePin(),
    kind,
    subject,
    sections,
    label,
    issuedAt: new Date().toISOString(),
  };
}

const TEACHER_ID_RE = /^[A-Z]+-[A-Z0-9]+-[A-Z0-9]{4}$/;

export function isTeacherIdShape(id: string): boolean {
  return TEACHER_ID_RE.test(id.trim().toUpperCase());
}

/** Student self-creates a code from their chosen call-sign + section. */
export function makeStudentCode(params: {
  classLevel: string;
  section: string;
  subject: string;
  avatarId: number;
}): StudentCode {
  const { classLevel, section, subject, avatarId } = params;
  const animal = ANIMALS[avatarId % ANIMALS.length];
  const code = `${animal}·${1 + randInt(9)}${section}`;
  return {
    code,
    pinSet: false,
    classLevel,
    section,
    subject,
    avatarId,
    createdAt: new Date().toISOString(),
  };
}

/** Rebuild a student identity from a code that already exists.
 *
 *  Sign-in must never go through ``makeStudentCode`` — that *mints* a code,
 *  so a returning child would be handed a fresh identity (and always the same
 *  one, since it reads ANIMALS[avatarId] and the caller passed 0 = KESTREL).
 *  The code the child typed is the identity; this only parses it back out.
 */
export function studentFromCode(code: string, opts?: { classLevel?: string; subject?: string }): StudentCode {
  const clean = code.trim().toUpperCase();
  const animal = clean.split("·")[0] ?? "";
  const tail = clean.split("·")[1] ?? "";
  const idx = ANIMALS.indexOf(animal);
  return {
    code: clean,
    pinSet: false,
    classLevel: opts?.classLevel ?? "Class 7",
    // Trailing letter is the section ("4B" -> "B"); numeric-only tails have none.
    section: /[A-Z]$/.test(tail) ? tail.slice(-1) : "",
    subject: opts?.subject ?? "Maths",
    avatarId: idx >= 0 ? idx : 0,
    createdAt: new Date().toISOString(),
  };
}

export function isPinShape(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
