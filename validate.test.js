import test from "node:test";
import assert from "node:assert/strict";
import { validatePayload } from "./validate.js";

const SID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const make = (o = {}) => ({ sessionId: SID, step: 1, answers: { Role: "Founder or co-founder" }, ...o });

test("accepts a minimal valid payload and fills defaults", () => {
  const r = validatePayload(make());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    sessionId: SID, step: 1, completed: false, answers: { Role: "Founder or co-founder" },
    name: "", company: "", contact: "", score: 0, skips: 0,
  });
});

test("rejects bodies that are not plain objects", () => {
  for (const b of [null, undefined, "x", 5, [], [make()]]) assert.equal(validatePayload(b).ok, false);
});

test("rejects a malformed session id", () => {
  for (const s of ["", "abc", "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6", 123, null]) {
    assert.equal(validatePayload(make({ sessionId: s })).ok, false);
  }
});

test("rejects steps that are not integers from 0 to 9", () => {
  for (const s of [-1, 10, 1.5, "3", null, NaN]) assert.equal(validatePayload(make({ step: s })).ok, false);
  for (const s of [0, 9]) assert.equal(validatePayload(make({ step: s })).ok, true);
});

test("drops unknown answer keys", () => {
  const r = validatePayload(make({ answers: { Role: "Founder or co-founder", Hacker: "x", constructor: "y" } }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value.answers), ["Role"]);
});

test("rejects answers longer than 500 characters but accepts exactly 500", () => {
  assert.equal(validatePayload(make({ answers: { "Backlog task": "a".repeat(501) } })).ok, false);
  assert.equal(validatePayload(make({ answers: { "Backlog task": "a".repeat(500) } })).ok, true);
});

test("accepts multi-select lists but caps their size and item type", () => {
  assert.equal(validatePayload(make({ answers: { Comfort: ["A", "B"] } })).ok, true);
  assert.equal(validatePayload(make({ answers: { Comfort: Array(11).fill("A") } })).ok, false);
  assert.equal(validatePayload(make({ answers: { Comfort: [1] } })).ok, false);
});

test("rejects answers of other types", () => {
  for (const v of [5, { a: 1 }, true, null]) assert.equal(validatePayload(make({ answers: { Role: v } })).ok, false);
});

test("drops empty answers", () => {
  const r = validatePayload(make({ answers: { Role: "   ", Comfort: [] } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.answers, {});
});

test("strips control characters including null bytes", () => {
  const r = validatePayload(make({ answers: { "Backlog task": "Hello\u0000 World\u0007" } }));
  assert.equal(r.value.answers["Backlog task"], "Hello World");
});

test("trims contact fields and rejects ones over 120 characters", () => {
  const r = validatePayload(make({ name: "  Ali  ", company: " ACME ", contact: " a@b.co " }));
  assert.deepEqual([r.value.name, r.value.company, r.value.contact], ["Ali", "ACME", "a@b.co"]);
  assert.equal(validatePayload(make({ name: "a".repeat(121) })).ok, false);
});

test("completed is a boolean and requires the final step", () => {
  assert.equal(validatePayload(make({ completed: true, step: 9 })).ok, true);
  assert.equal(validatePayload(make({ completed: true, step: 8 })).ok, false);
  assert.equal(validatePayload(make({ completed: "yes", step: 9 })).ok, false);
});

test("clamps score and skips instead of rejecting", () => {
  const r = validatePayload(make({ score: 999999, skips: 1000 }));
  assert.equal(r.value.score, 5000);
  assert.equal(r.value.skips, 99);
  const s = validatePayload(make({ score: "abc", skips: -4 }));
  assert.equal(s.value.score, 0);
  assert.equal(s.value.skips, 0);
});
