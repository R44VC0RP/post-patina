(function startPostAgeColors() {
  "use strict";

  const {
    DEFAULT_SETTINGS,
    sanitizeSettings,
    classifyTimestamp,
    rgbaFromHex,
    solidTintFromHex,
    formatAge
  } = globalThis.XPostAge;

  const POST_SELECTOR = 'article[data-testid="tweet"]';
  const HIGHLIGHT_CLASS = "xpa-highlighted";
  const TIME_CLASS = "xpa-time-emphasis";
  const AGE_LABEL_CLASS = "xpa-age-label";
  const GRADIENT_CLASS = "xpa-color-transition";
  const GRADIENT_IN_CLASS = "xpa-color-transition-in";
  const GRADIENT_OUT_CLASS = "xpa-color-transition-out";
  const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const TIMELINE_SELECTOR = '[aria-label^="Timeline:"]';
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

  function parseOpaqueRgb(color) {
    const match = color.match(
      /^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
    );

    if (!match || (match[4] !== undefined && Number(match[4]) < 1)) {
      return null;
    }

    return match.slice(1, 4).map(Number);
  }

  function findBaseBackground(post) {
    let element = post.parentElement;

    while (element) {
      const rgb = parseOpaqueRgb(window.getComputedStyle(element).backgroundColor);
      if (rgb) {
        return rgb;
      }
      element = element.parentElement;
    }

    return [0, 0, 0];
  }

  function clearPost(post) {
    post.classList.remove(HIGHLIGHT_CLASS);
    post.removeAttribute("data-xpa-age-band");
    post.removeAttribute("data-xpa-timestamp");
    post.style.removeProperty("--xpa-background-color");
    post.style.removeProperty("--xpa-solid-background-color");
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
    const baseBackground = findBaseBackground(post);

    post.classList.add(HIGHLIGHT_CLASS);
    post.setAttribute("data-xpa-age-band", classification.key);
    post.setAttribute("data-xpa-timestamp", timestamp);
    post.style.setProperty(
      "--xpa-background-color",
      rgbaFromHex(classification.color, tintAlpha)
    );
    post.style.setProperty(
      "--xpa-solid-background-color",
      solidTintFromHex(classification.color, baseBackground, tintAlpha)
    );
    post.style.setProperty("--xpa-band-color", classification.color);
    updateTimeLabel(post, time, classification);
  }

  function clearThreadGradients() {
    document.querySelectorAll(`.${GRADIENT_CLASS}`).forEach((post) => {
      post.classList.remove(GRADIENT_CLASS);
      post.removeAttribute("data-xpa-gradient");
      post.style.removeProperty("--xpa-gradient-from");
      post.style.removeProperty("--xpa-gradient-to");
    });

    document
      .querySelectorAll(`.${GRADIENT_IN_CLASS}, .${GRADIENT_OUT_CLASS}`)
      .forEach((element) => {
        element.classList.remove(GRADIENT_IN_CLASS, GRADIENT_OUT_CLASS);
        element.style.removeProperty("--xpa-divider-color");
      });
  }

  function findBorderOwner(post, side) {
    const cell = post.closest(CELL_SELECTOR);
    const widthProperty = side === "top" ? "borderTopWidth" : "borderBottomWidth";
    const styleProperty = side === "top" ? "borderTopStyle" : "borderBottomStyle";
    let element = post;

    while (element) {
      const computed = window.getComputedStyle(element);
      if (
        Number.parseFloat(computed[widthProperty]) > 0 &&
        computed[styleProperty] !== "none"
      ) {
        return element;
      }

      if (element === cell) {
        break;
      }
      element = element.parentElement;
    }

    return null;
  }

  function shareTimeline(previousPost, currentPost) {
    const previousTimeline = previousPost.closest(TIMELINE_SELECTOR);
    const currentTimeline = currentPost.closest(TIMELINE_SELECTOR);

    if (previousTimeline || currentTimeline) {
      return previousTimeline !== null && previousTimeline === currentTimeline;
    }

    const previousCell = previousPost.closest(CELL_SELECTOR);
    const currentCell = currentPost.closest(CELL_SELECTOR);

    if (!previousCell || !currentCell) {
      return false;
    }

    return (
      previousCell === currentCell ||
      previousCell.parentElement === currentCell.parentElement
    );
  }

  function markBoundaryElement(element, className, color) {
    if (!element) {
      return;
    }

    element.classList.add(className);
    element.style.setProperty("--xpa-divider-color", color);
  }

  function markTransitionBoundary(previousPost, currentPost, fromColor) {
    markBoundaryElement(previousPost, GRADIENT_OUT_CLASS, fromColor);
    markBoundaryElement(currentPost, GRADIENT_IN_CLASS, fromColor);
    markBoundaryElement(
      findBorderOwner(previousPost, "bottom"),
      GRADIENT_OUT_CLASS,
      fromColor
    );
    markBoundaryElement(
      findBorderOwner(currentPost, "top"),
      GRADIENT_IN_CLASS,
      fromColor
    );

    const previousCell = previousPost.closest(CELL_SELECTOR);
    const currentCell = currentPost.closest(CELL_SELECTOR);

    markBoundaryElement(previousCell, GRADIENT_OUT_CLASS, fromColor);
    markBoundaryElement(currentCell, GRADIENT_IN_CLASS, fromColor);
  }

  function setTransitionColors(currentPost, previousBand, currentBand, from, to) {
    currentPost.classList.add(GRADIENT_CLASS);
    currentPost.setAttribute(
      "data-xpa-gradient",
      `${previousBand}-to-${currentBand}`
    );
    currentPost.style.setProperty("--xpa-gradient-from", from);
    currentPost.style.setProperty("--xpa-gradient-to", to);
  }

  function hasInterveningTimelineCell(previousPost, currentPost) {
    const previousCell = previousPost.closest(CELL_SELECTOR);
    const currentCell = currentPost.closest(CELL_SELECTOR);

    if (!previousCell || !currentCell || previousCell === currentCell) {
      return false;
    }

    let sibling = previousCell.nextElementSibling;
    while (sibling && sibling !== currentCell) {
      if (sibling.matches(CELL_SELECTOR)) {
        return true;
      }
      sibling = sibling.nextElementSibling;
    }

    return sibling !== currentCell;
  }

  function isTransitionPair(previousPost, currentPost) {
    if (!shareTimeline(previousPost, currentPost)) {
      return false;
    }

    if (hasInterveningTimelineCell(previousPost, currentPost)) {
      return false;
    }

    return true;
  }

  function transitionColors(previousPost, currentPost) {
    return {
      from: previousPost.style.getPropertyValue("--xpa-solid-background-color"),
      to: currentPost.style.getPropertyValue("--xpa-solid-background-color")
    };
  }

  function applyTransition(previousPost, currentPost, previousBand, currentBand) {
    const { from, to } = transitionColors(previousPost, currentPost);

    if (!from || !to) {
      return;
    }

    markTransitionBoundary(previousPost, currentPost, from);
    setTransitionColors(currentPost, previousBand, currentBand, from, to);
  }

  function shouldTransition(previousPost, currentPost) {
    const previousBand = previousPost.getAttribute("data-xpa-age-band");
    const currentBand = currentPost.getAttribute("data-xpa-age-band");

    if (!previousBand || !currentBand || previousBand === currentBand) {
      return null;
    }

    if (!isTransitionPair(previousPost, currentPost)) {
      return null;
    }

    return { previousBand, currentBand };
  }

  function applyPairTransition(previousPost, currentPost) {
    const bands = shouldTransition(previousPost, currentPost);

    if (!bands) {
      return;
    }

    applyTransition(
      previousPost,
      currentPost,
      bands.previousBand,
      bands.currentBand
    );
  }

  function applyThreadGradients(posts) {
    clearThreadGradients();

    if (!settings.enabled) {
      return;
    }

    for (let index = 1; index < posts.length; index += 1) {
      applyPairTransition(posts[index - 1], posts[index]);
    }
  }

  function scanPosts() {
    scanTimer = null;
    const nowMs = Date.now();
    const posts = [...document.querySelectorAll(POST_SELECTOR)];
    posts.forEach((post) => updatePost(post, nowMs));
    applyThreadGradients(posts);
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
