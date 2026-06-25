(function startPostAgeColors() {
  "use strict";

  const {
    DEFAULT_SETTINGS,
    sanitizeSettings,
    classifyTimestamp,
    rgbaFromHex,
    formatAge
  } = globalThis.XPostAge;

  const POST_SELECTOR = 'article[data-testid="tweet"]';
  const HIGHLIGHT_CLASS = "xpa-highlighted";
  const TIME_CLASS = "xpa-time-emphasis";
  const AGE_LABEL_CLASS = "xpa-age-label";
  const RESCAN_INTERVAL_MS = 60_000;
  const MUTATION_DEBOUNCE_MS = 60;

  let settings = sanitizeSettings(DEFAULT_SETTINGS);
  let scanTimer = null;

  function belongsToPost(element, post) {
    return element.closest(POST_SELECTOR) === post;
  }

  function findPrimaryTime(post) {
    const ownTimes = [...post.querySelectorAll("time[datetime]")].filter((time) =>
      belongsToPost(time, post)
    );
    const statusTimes = ownTimes.filter((time) => time.closest('a[href*="/status/"]'));

    // On a post detail page, a quoted post's timestamp can appear before the
    // main timestamp. Quoted cards add another link-like ancestor, so prefer
    // the candidate with the shallowest interactive nesting.
    statusTimes.sort((left, right) => {
      function linkDepth(time) {
        let depth = 0;
        let ancestor = time.parentElement;

        while (ancestor && ancestor !== post) {
          if (ancestor.matches("a[href], [role=\"link\"]")) {
            depth += 1;
          }
          ancestor = ancestor.parentElement;
        }

        return depth;
      }

      return linkDepth(left) - linkDepth(right);
    });

    return statusTimes[0] || ownTimes[0] || null;
  }

  function findOwnAgeLabels(post) {
    return [...post.querySelectorAll(`.${AGE_LABEL_CLASS}`)].filter((label) =>
      belongsToPost(label, post)
    );
  }

  function clearPost(post) {
    post.classList.remove(HIGHLIGHT_CLASS);
    post.removeAttribute("data-xpa-age-band");
    post.removeAttribute("data-xpa-timestamp");
    post.style.removeProperty("--xpa-background-color");
    post.style.removeProperty("--xpa-band-color");
    [...post.querySelectorAll(`time.${TIME_CLASS}`)]
      .filter((time) => belongsToPost(time, post))
      .forEach((time) => time.classList.remove(TIME_CLASS));
    findOwnAgeLabels(post).forEach((label) => label.remove());
  }

  function updateTimeLabel(post, time, classification) {
    const existingLabels = findOwnAgeLabels(post);
    let label = existingLabels[0];

    existingLabels.slice(1).forEach((duplicate) => duplicate.remove());

    time.classList.add(TIME_CLASS);

    if (!label || !label.isConnected || label.previousElementSibling !== time) {
      label?.remove();
      label = document.createElement("span");
      label.className = AGE_LABEL_CLASS;
      label.setAttribute("aria-hidden", "true");
      time.insertAdjacentElement("afterend", label);
    }

    const labelText = ` | ${classification.label}`;
    if (label.textContent !== labelText) {
      label.textContent = labelText;
    }
    label.title = `${classification.label}: posted ${formatAge(classification.ageHours)} ago`;
  }

  function updatePost(post, nowMs) {
    if (!settings.enabled) {
      clearPost(post);
      return;
    }

    const time = findPrimaryTime(post);
    const timestamp = time?.getAttribute("datetime");
    const classification = timestamp
      ? classifyTimestamp(timestamp, nowMs, settings)
      : null;

    if (!time || !classification) {
      clearPost(post);
      return;
    }

    const tintAlpha = settings.tintStrength / 100;

    post.classList.add(HIGHLIGHT_CLASS);
    post.setAttribute("data-xpa-age-band", classification.key);
    post.setAttribute("data-xpa-timestamp", timestamp);
    post.style.setProperty(
      "--xpa-background-color",
      rgbaFromHex(classification.color, tintAlpha)
    );
    post.style.setProperty("--xpa-band-color", classification.color);
    updateTimeLabel(post, time, classification);
  }

  function scanPosts() {
    scanTimer = null;
    const nowMs = Date.now();
    document.querySelectorAll(POST_SELECTOR).forEach((post) => updatePost(post, nowMs));
  }

  function scheduleScan() {
    if (scanTimer !== null) {
      return;
    }

    scanTimer = window.setTimeout(scanPosts, MUTATION_DEBOUNCE_MS);
  }

  function applySettings(nextSettings) {
    settings = sanitizeSettings(nextSettings);
    scanPosts();
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
      if (chrome.runtime.lastError) {
        applySettings(DEFAULT_SETTINGS);
        return;
      }

      applySettings(storedSettings);
    });
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["datetime"]
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const nextSettings = { ...settings };
    Object.entries(changes).forEach(([key, change]) => {
      nextSettings[key] = change.newValue;
    });
    applySettings(nextSettings);
  });

  window.setInterval(scanPosts, RESCAN_INTERVAL_MS);
  scanPosts();
  loadSettings();
})();
