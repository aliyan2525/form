// Pure validation and normalisation for survey saves. No I/O, so it is easy to test.
export const QUESTION_KEYS = [
  "Role", "Team size", "Who tests", "Backlog task",
  "Student experience", "Price", "Comfort", "Trial",
];
// Steps: 0-7 questions, 8 contact details, 9 finished.
export const FINAL_STEP = 9;

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Control characters, including NUL (Postgres jsonb cannot store \u0000).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ANSWER_MAX = 500;
const ITEM_MAX = 200;
const LIST_MAX = 10;
const FIELD_MAX = 120;
const SCORE_MAX = 5000;
const SKIPS_MAX = 99;

const clean = (s) => s.replace(CONTROL, "").trim();
const clamp = (v, max) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0;
const fail = (error) => ({ ok: false, error });

export function validatePayload(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return fail("body must be an object");
  if (typeof b.sessionId !== "string" || !SESSION_ID.test(b.sessionId)) return fail("invalid sessionId");
  if (!Number.isInteger(b.step) || b.step < 0 || b.step > FINAL_STEP) return fail("invalid step");

  const completed = b.completed ?? false;
  if (typeof completed !== "boolean") return fail("invalid completed");
  if (completed && b.step !== FINAL_STEP) return fail("completed requires the final step");

  const raw = b.answers ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("invalid answers");

  const answers = {};
  for (const key of QUESTION_KEYS) {
    if (!Object.hasOwn(raw, key)) continue;
    const v = raw[key];
    if (typeof v === "string") {
      const s = clean(v);
      if (s.length > ANSWER_MAX) return fail(`answer too long: ${key}`);
      if (s) answers[key] = s;
    } else if (Array.isArray(v)) {
      if (v.length > LIST_MAX) return fail(`too many items: ${key}`);
      const items = [];
      for (const item of v) {
        if (typeof item !== "string") return fail(`invalid item: ${key}`);
        const s = clean(item);
        if (s.length > ITEM_MAX) return fail(`item too long: ${key}`);
        if (s) items.push(s);
      }
      if (items.length) answers[key] = items;
    } else {
      return fail(`invalid answer: ${key}`);
    }
  }

  const fields = {};
  for (const key of ["name", "company", "contact"]) {
    const v = b[key] ?? "";
    if (typeof v !== "string") return fail(`invalid ${key}`);
    const s = clean(v);
    if (s.length > FIELD_MAX) return fail(`${key} too long`);
    fields[key] = s;
  }

  return {
    ok: true,
    value: {
      sessionId: b.sessionId.toLowerCase(),
      step: b.step,
      completed,
      answers,
      ...fields,
      score: clamp(b.score, SCORE_MAX),
      skips: clamp(b.skips, SKIPS_MAX),
    },
  };
}
