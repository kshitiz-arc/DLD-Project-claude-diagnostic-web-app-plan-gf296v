// Identity & access model (plan §1, §5.i, §10).
//
// Three actors with different provisioning paths:
//   - admin    : signs in with a credential; ISSUES teacher IDs. Never sees a
//                child's real identity — only opaque codes.
//   - teacher  : signs in with an admin-issued ID. Role-scoped access:
//                a class teacher owns one section; a subject teacher sees their
//                subject across the sections assigned to them.
//   - student  : SELF-CREATES an anonymous code (class -> section -> subject ->
//                call-sign + optional PIN). No name, no email — data-minimised.

export type Role = "admin" | "teacher" | "student";

export type TeacherKind = "class" | "subject";

/** An admin-issued teacher credential. */
export interface TeacherId {
  id: string; // e.g. "MATH-7B-K3Q9" (class) or "MATH-ABC-7710" (subject)
  pin: string; // 4-digit temporary PIN, changed on first login in deployment
  kind: TeacherKind;
  subject: string;
  /** class teacher -> one section; subject teacher -> many. */
  sections: string[];
  label: string; // human-readable scope, e.g. "Class 7B · all students"
  issuedAt: string; // ISO timestamp
  /** Bearer token from the server; console scope is resolved from it. */
  token?: string;
}

/** A self-created, PII-free student identity. */
export interface StudentCode {
  code: string; // e.g. "KESTREL·4B"
  pinSet: boolean;
  classLevel: string; // "Class 7"
  section: string; // "B"
  subject: string; // "Maths"
  avatarId: number;
  createdAt: string;
}

export type Session =
  | { role: "admin" }
  | { role: "teacher"; teacher: TeacherId }
  | { role: "student"; student: StudentCode };
