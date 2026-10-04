// Card content validators — pure functions, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { experiences, education, highlights } from "../api/validate.mjs";

test("experiences keep only known fields and trim", () => {
  const out = experiences([{ org: " Canva ", role: "PM intern", period: "2025.11–2026.2", summary: "x", extra: "dropped" }]);
  assert.deepEqual(out, [{ org: "Canva", role: "PM intern", period: "2025.11–2026.2", summary: "x" }]);
});

test("experiences need an org and cap at 8", () => {
  assert.throws(() => experiences([{ role: "no org" }]), /org: required/);
  assert.throws(() => experiences(Array.from({ length: 9 }, () => ({ org: "a" }))), /max 8/);
  assert.deepEqual(experiences(undefined), []);
});

test("education needs a school and caps at 4", () => {
  assert.deepEqual(education([{ school: "University of Melbourne", degree: "BCom", period: "2023–2026" }]),
    [{ school: "University of Melbourne", degree: "BCom", period: "2023–2026" }]);
  assert.throws(() => education([{ degree: "BCom" }]), /school: required/);
  assert.throws(() => education(Array.from({ length: 5 }, () => ({ school: "a" }))), /max 4/);
});

test("highlights: three short lines, text required", () => {
  assert.deepEqual(highlights([{ text: " UniHack 2025 第一名 ", url: "" }]), [{ text: "UniHack 2025 第一名", url: null }]);
  assert.throws(() => highlights([{ url: "https://x.y" }]), /text: required/);
  assert.throws(() => highlights([{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }]), /max 3/);
});
