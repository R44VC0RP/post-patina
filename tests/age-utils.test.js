"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  getBandIndex,
  classifyTimestamp,
  rgbaFromHex,
  solidTintFromHex,
  formatAge,
  describeBandRange
} = require("../age-utils.js");

test("maps representative sample posts to the default age bands", () => {
  const now = Date.parse("2026-06-25T14:31:22.000Z");

  assert.equal(classifyTimestamp("2026-06-25T14:13:22.000Z", now, DEFAULT_SETTINGS).key, "fresh");
  assert.equal(classifyTimestamp("2026-06-25T07:06:00.000Z", now, DEFAULT_SETTINGS).key, "aging");
  assert.equal(classifyTimestamp("2026-06-24T17:45:48.000Z", now, DEFAULT_SETTINGS).key, "old");
  assert.equal(classifyTimestamp("2026-06-17T04:12:25.000Z", now, DEFAULT_SETTINGS).key, "stale");
});

test("moves exact cutoff values into the next band", () => {
  assert.equal(getBandIndex(0.999, [1, 6, 12, 24]), 0);
  assert.equal(getBandIndex(1, [1, 6, 12, 24]), 1);
  assert.equal(getBandIndex(6, [1, 6, 12, 24]), 2);
  assert.equal(getBandIndex(12, [1, 6, 12, 24]), 3);
  assert.equal(getBandIndex(24, [1, 6, 12, 24]), 4);
});

test("clamps display strength and rejects malformed setting arrays", () => {
  const settings = sanitizeSettings({
    enabled: false,
    tintStrength: 99,
    bandShadow: "yes",
    thresholdsHours: [12, 6, 1, 24],
    colors: ["#ABCDEF", "bad", "#010203", "#040506", "#070809"]
  });

  assert.equal(settings.enabled, false);
  assert.equal(settings.tintStrength, 40);
  assert.equal(settings.bandShadow, false);
  assert.equal(sanitizeSettings({ bandShadow: true }).bandShadow, true);
  assert.deepEqual(settings.thresholdsHours, [1, 6, 12, 24]);
  assert.deepEqual(settings.colors, ["#abcdef", "#06b6d4", "#010203", "#040506", "#070809"]);
});

test("formats colors, ages, and range labels", () => {
  assert.equal(rgbaFromHex("#f97316", 0.22), "rgba(249, 115, 22, 0.22)");
  assert.equal(rgbaFromHex("not-a-color", 0.2), null);
  assert.equal(solidTintFromHex("#f97316", [0, 0, 0], 0.22), "rgb(55, 25, 5)");
  assert.equal(solidTintFromHex("#22c55e", [255, 255, 255], 0.22), "rgb(206, 242, 220)");
  assert.equal(formatAge(20.5), "20 hours");
  assert.equal(formatAge(72), "3 days");
  assert.equal(describeBandRange(3, [1, 6, 12, 24]), "12–24h");
  assert.equal(describeBandRange(4, [1, 6, 12, 24]), "24h+");
});

test("handles invalid and future timestamps safely", () => {
  assert.equal(classifyTimestamp("not-a-date", Date.now(), DEFAULT_SETTINGS), null);

  const future = classifyTimestamp(
    "2030-01-01T01:00:00.000Z",
    Date.parse("2030-01-01T00:00:00.000Z"),
    DEFAULT_SETTINGS
  );
  assert.equal(future.key, "fresh");
  assert.equal(future.ageHours, 0);
});
