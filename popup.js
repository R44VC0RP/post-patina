(function initializePopup() {
  "use strict";

  const {
    BAND_DEFINITIONS,
    DEFAULT_SETTINGS,
    cloneDefaults,
    sanitizeSettings,
    isValidThresholds,
    describeBandRange
  } = globalThis.XPostAge;

  const enabledInput = document.querySelector("#enabled");
  const tintInput = document.querySelector("#tint-strength");
  const tintOutput = document.querySelector("#tint-output");
  const bandShadowInput = document.querySelector("#band-shadow");
  const bandList = document.querySelector("#band-list");
  const thresholdList = document.querySelector("#threshold-list");
  const thresholdError = document.querySelector("#threshold-error");
  const resetButton = document.querySelector("#reset");
  const saveStatus = document.querySelector("#save-status");

  let settings = cloneDefaults();
  let statusTimer = null;

  function createBandRows() {
    BAND_DEFINITIONS.forEach((band, index) => {
      const row = document.createElement("div");
      row.className = "band-row";
      row.innerHTML = `
        <input class="color-input" type="color" data-color-index="${index}" aria-label="${band.label} color" />
        <div>
          <div class="band-name">${band.label}</div>
          <div class="band-range" data-range-index="${index}"></div>
        </div>
        <span class="preview-pill" data-preview-index="${index}">${band.label}</span>
      `;
      bandList.append(row);
    });
  }

  function createThresholdFields() {
    BAND_DEFINITIONS.slice(0, -1).forEach((band, index) => {
      const label = document.createElement("label");
      label.className = "threshold-field";
      label.innerHTML = `
        ${band.label} ends at
        <span class="threshold-input-wrap">
          <input class="threshold-input" type="number" min="0.25" max="720" step="0.25" data-threshold-index="${index}" />
          <span>h</span>
        </span>
      `;
      thresholdList.append(label);
    });
  }

  function showSaved(message = "Saved") {
    window.clearTimeout(statusTimer);
    saveStatus.textContent = message;
    statusTimer = window.setTimeout(() => {
      saveStatus.textContent = "";
    }, 1_400);
  }

  function render() {
    enabledInput.checked = settings.enabled;
    tintInput.value = String(settings.tintStrength);
    tintOutput.value = `${settings.tintStrength}%`;
    bandShadowInput.checked = settings.bandShadow;

    document.querySelectorAll("[data-color-index]").forEach((input) => {
      const index = Number(input.dataset.colorIndex);
      input.value = settings.colors[index];
    });

    document.querySelectorAll("[data-preview-index]").forEach((preview) => {
      const index = Number(preview.dataset.previewIndex);
      preview.style.backgroundColor = settings.colors[index];
    });

    document.querySelectorAll("[data-range-index]").forEach((range) => {
      const index = Number(range.dataset.rangeIndex);
      range.textContent = describeBandRange(index, settings.thresholdsHours);
    });

    document.querySelectorAll("[data-threshold-index]").forEach((input) => {
      const index = Number(input.dataset.thresholdIndex);
      input.value = String(settings.thresholdsHours[index]);
    });
  }

  function persist(nextSettings, message) {
    settings = sanitizeSettings(nextSettings);
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        saveStatus.textContent = "Could not save";
        return;
      }

      render();
      showSaved(message);
    });
  }

  function readThresholds() {
    return [...document.querySelectorAll("[data-threshold-index]")].map((input) =>
      Number(input.value)
    );
  }

  createBandRows();
  createThresholdFields();

  enabledInput.addEventListener("change", () => {
    persist({ ...settings, enabled: enabledInput.checked });
  });

  tintInput.addEventListener("input", () => {
    tintOutput.value = `${tintInput.value}%`;
  });

  tintInput.addEventListener("change", () => {
    persist({ ...settings, tintStrength: Number(tintInput.value) });
  });

  bandShadowInput.addEventListener("change", () => {
    persist({ ...settings, bandShadow: bandShadowInput.checked });
  });

  bandList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-color-index]");
    if (!input) {
      return;
    }

    const index = Number(input.dataset.colorIndex);
    const colors = [...settings.colors];
    colors[index] = input.value;
    persist({ ...settings, colors });
  });

  thresholdList.addEventListener("change", () => {
    const thresholdsHours = readThresholds();

    if (!isValidThresholds(thresholdsHours)) {
      thresholdError.textContent = "Use four increasing values between 0.25 and 720 hours.";
      return;
    }

    thresholdError.textContent = "";
    persist({ ...settings, thresholdsHours });
  });

  resetButton.addEventListener("click", () => {
    thresholdError.textContent = "";
    persist(cloneDefaults(), "Reset");
  });

  chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
    settings = chrome.runtime.lastError
      ? cloneDefaults()
      : sanitizeSettings(storedSettings);
    render();
  });
})();
