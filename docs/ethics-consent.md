# Privacy, consent & research ethics (plan §10)

The subjects are minors and the data is destined for publication. Both facts
are design constraints, not paperwork to add later. Retrofitting consent onto
already-collected children's data is not a fixable problem.

## What the system stores — and what it refuses to

**Stored:** an opaque student code (e.g. `KESTREL·4B12`), an optional 4-digit
PIN hash, an avatar number, class/section/subject, and every response with its
scoring payload and timing.

**Never collected, at any point:** name, roll number, email, phone, date of
birth, photo, IP-based identity, device identifiers. There is no field for any
of them. The admin issuing teacher IDs never sees a child's real identity
either — only codes.

This is data minimisation as an architectural property: the export cannot leak
PII because none was ever collected.

## Re-identification is a roster, not a database

Linking codes back to real children requires the teacher's own roster, held
outside this system. Keep that mapping:

- on paper or in a separate access-controlled file, **never in `hyperion.db`**;
- only as long as the intervention needs it;
- out of anything exported for analysis or publication.

Analysis and publication use codes only. That is what makes the dataset
anonymised rather than merely pseudonymised at the point of use.

## Storage & access

- The database is local to the teacher's laptop. Nothing is uploaded anywhere;
  the server has no outbound calls at all.
- Snapshots land in `backend/backups/`. Treat that folder as the sensitive
  artefact it is — copy it to encrypted storage, don't leave it on a shared
  machine.
- The teacher console requires a token minted at teacher login; scope comes
  from the account, so a class teacher sees exactly their section. The admin
  gate is a separate passcode — **change it from the default before any pilot.**
- `*.db`, `*.db-wal`, `*.db-shm` and `backups/` are gitignored. Student data
  must never enter version control.

## Consent & assent — before any real sitting

This belongs in Phase 0, not after the data exists.

1. **Institutional approval.** Written permission from the school leadership to
   run the diagnostic and to use anonymised results for research.
2. **Parental consent.** Informed consent for participation *and* for
   anonymised research use, with an explicit opt-out that carries no academic
   cost. Opting out must be operationally real: the child simply doesn't sit.
3. **Child assent.** Age-appropriate explanation, in the child's own language:
   what the activity is, that it is not a graded test, that they can stop, and
   that their name is nowhere in it.
4. **Ethics review** if the publication venue requires it (most do for minors).
   Secure it before collection.

## What to tell the children

Say it plainly, and make it true:

- This is not a test and it is not graded.
- We are trying to find out what's confusing, so we can teach it better.
- Answering "not sure" honestly is the right move — guessing confidently is the
  only way to actually lose ground.
- Your name is not on it. Only your code.

The last two are also *measurement* requirements. A child who believes honesty
is punished will stop reporting honest confidence, and the confidence signal —
the thing the whole instrument is built around — degrades.

## Retention

Decide, in advance and in writing: how long raw responses are kept, when the
code↔roster mapping is destroyed, and who may access the dataset. Nothing in
the software enforces this for you.
