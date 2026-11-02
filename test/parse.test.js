import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount } from "../js/parse.js";

test("plain numbers", () => {
  assert.equal(parseAmount("0"), 0);
  assert.equal(parseAmount("42"), 42);
  assert.equal(parseAmount("12.5"), 12.5);
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount(".5"), 0.5);
  assert.equal(parseAmount("0.500"), 0.5);
});

test("a dot or comma followed by exactly 3 digits is a thousands separator", () => {
  assert.equal(parseAmount("50.000"), 50000);   // Colombia / Turkey style
  assert.equal(parseAmount("150,000"), 150000); // US style
  assert.equal(parseAmount("1,234"), 1234);
});

test("repeated separators are thousands separators", () => {
  assert.equal(parseAmount("1.000.000"), 1000000);
  assert.equal(parseAmount("2,500,000"), 2500000);
});

test("both separators: the last one is the decimal mark", () => {
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1.234.567,8"), 1234567.8);
});

test("spaces and apostrophes group digits", () => {
  assert.equal(parseAmount("1 000"), 1000);
  assert.equal(parseAmount("1 234,5"), 1234.5);
  assert.equal(parseAmount("1'000"), 1000);
});

test("long integer parts mean the mark is a decimal", () => {
  assert.equal(parseAmount("1234.567"), 1234.567);
  assert.equal(parseAmount("1234,5"), 1234.5);
});

test("3-decimal currencies keep 3 digits as decimals", () => {
  assert.equal(parseAmount("1.250", "JOD"), 1.25);
  assert.equal(parseAmount("1.250", "TRY"), 1250);
});

test("garbage is rejected", () => {
  for (const s of ["", "  ", "abc", "-5", "12a", "1.2.3", "12.34.5", "1,23,4.5", ".", ",", null, undefined])
    assert.ok(Number.isNaN(parseAmount(s)), `expected NaN for ${JSON.stringify(s)}`);
});
