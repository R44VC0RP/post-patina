(function exposeAgeUtils(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.XPostAge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAgeUtils() {
  "use strict";

  const BAND_DEFINITIONS = Object.freeze([
    Object.freeze({ key: "fresh", label: "Fresh" }),
    Object.freeze({ key: "recent", label: "Recent" }),
    Object.freeze({ key: "aging", label: "Aging" }),
    Object.freeze({ key: "old", label: "Old" }),
    Object.freeze({ key: "stale", label: "Stale" })
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    tintStrength: 22,
    bandShadow: false,
    thresholdsHours: Object.freeze([1, 6, 12, 24]),
    colors: Object.freeze([
      "#22c55e",
      "#06b6d4",
      "#eab308",
      "#f97316",
      "#ef4444"
    ])
  });

  const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

  function cloneDefaults() {
    return {
      enabled: DEFAULT_SETTINGS.enabled,
      tintStrength: DEFAULT_SETTINGS.tintStrength,
      bandShadow: DEFAULT_SETTINGS.bandShadow,
      thresholdsHours: [...DEFAULT_SETTINGS.thresholdsHours],
      colors: [...DEFAULT_SETTINGS.colors]
    };
  }

  function isValidThresholds(values) {
    return (
      Array.isArray(values) &&
      values.length === DEFAULT_SETTINGS.thresholdsHours.length &&
      values.every((value) => Number.isFinite(Number(value))) &&
      values.every((value) => Number(value) >= 0.25 && Number(value) <= 720) &&
      values.every((value, index) => index === 0 || Number(value) > Number(values[index - 1]))
    );
  }

  function sanitizeSettings(input) {
    const defaults = cloneDefaults();
    const source = input && typeof input === "object" ? input : {};
    const strength = Number(source.tintStrength);

    const thresholdsHours = isValidThresholds(source.thresholdsHours)
      ? source.thresholdsHours.map(Number)
      : defaults.thresholdsHours;

    const colors = defaults.colors.map((fallback, index) => {
      const candidate = Array.isArray(source.colors) ? source.colors[index] : null;
      return typeof candidate === "string" && HEX_COLOR_PATTERN.test(candidate)
        ? candidate.toLowerCase()
        : fallback;
    });

    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
      tintStrength: Number.isFinite(strength)
        ? Math.min(40, Math.max(8, Math.round(strength)))
        : defaults.tintStrength,
      bandShadow:
        typeof source.bandShadow === "boolean" ? source.bandShadow : defaults.bandShadow,
      thresholdsHours,
      colors
    };
  }

  function getBandIndex(ageHours, thresholdsHours) {
    const safeAge = Math.max(0, Number(ageHours) || 0);

    for (let index = 0; index < thresholdsHours.length; index += 1) {
      if (safeAge < thresholdsHours[index]) {
        return index;
      }
    }

    return thresholdsHours.length;
  }

  function classifyTimestamp(timestamp, nowMs, settings) {
    const publishedAt = Date.parse(timestamp);
    const currentTime = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

    if (!Number.isFinite(publishedAt)) {
      return null;
    }

    const normalized = sanitizeSettings(settings);
    const ageHours = Math.max(0, (currentTime - publishedAt) / 3_600_000);
    const index = getBandIndex(ageHours, normalized.thresholdsHours);
    const definition = BAND_DEFINITIONS[index];

    return {
      index,
      key: definition.key,
      label: definition.label,
      color: normalized.colors[index],
      ageHours,
      publishedAt
    };
  }

  function rgbaFromHex(hex, alpha) {
    if (typeof hex !== "string" || !HEX_COLOR_PATTERN.test(hex)) {
      return null;
    }

    const value = hex.slice(1);
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    const safeAlpha = Math.min(1, Math.max(0, Number(alpha) || 0));

    return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
  }

  function solidTintFromHex(hex, backgroundRgb, alpha) {
    if (
      typeof hex !== "string" ||
      !HEX_COLOR_PATTERN.test(hex) ||
      !Array.isArray(backgroundRgb) ||
      backgroundRgb.length !== 3 ||
      !backgroundRgb.every((channel) => Number.isFinite(Number(channel)))
    ) {
      return null;
    }

    const value = hex.slice(1);
    const foreground = [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16)
    ];
    const safeAlpha = Math.min(1, Math.max(0, Number(alpha) || 0));
    const mixed = foreground.map((channel, index) => {
      const background = Math.min(255, Math.max(0, Number(backgroundRgb[index])));
      return Math.round(channel * safeAlpha + background * (1 - safeAlpha));
    });

    return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
  }

  function formatAge(ageHours) {
    const safeAge = Math.max(0, Number(ageHours) || 0);
    const minutes = Math.floor(safeAge * 60);

    if (minutes < 1) {
      return "less than a minute";
    }

    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    if (safeAge < 48) {
      const hours = Math.floor(safeAge);
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }

    const days = Math.floor(safeAge / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  function formatHours(hours) {
    const number = Number(hours);
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
  }

  function describeBandRange(index, thresholdsHours) {
    const thresholds = isValidThresholds(thresholdsHours)
      ? thresholdsHours.map(Number)
      : [...DEFAULT_SETTINGS.thresholdsHours];

    if (index === 0) {
      return `Under ${formatHours(thresholds[0])}h`;
    }

    if (index === BAND_DEFINITIONS.length - 1) {
      return `${formatHours(thresholds.at(-1))}h+`;
    }

    return `${formatHours(thresholds[index - 1])}–${formatHours(thresholds[index])}h`;
  }

  return Object.freeze({
    BAND_DEFINITIONS,
    DEFAULT_SETTINGS,
    cloneDefaults,
    sanitizeSettings,
    isValidThresholds,
    getBandIndex,
    classifyTimestamp,
    rgbaFromHex,
    solidTintFromHex,
    formatAge,
    describeBandRange
  });
});
