(() => {
  const section = document.querySelector("#experience");
  const track = document.querySelector(".career-flow");
  const stage = track?.querySelector(".career-flow-stage");
  const steps = [...(section?.querySelectorAll(".career-step") || [])];
  if (!stage || steps.length !== 4) return;

  const mobile = window.matchMedia("(max-width: 599px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const contactIsland = document.querySelector(".contact-island");
  const visualViewport = window.visualViewport;
  const lines = steps.slice(0, -1).map((step) => step.querySelector(".career-connector"));
  const strikeLines = steps.map(() => []);
  const strikeProgresses = [0, 0, 0];
  const strikeDuration = 840;
  let frame = 0;
  let activeIndex = 0;
  let hasRendered = false;
  let needsMeasure = true;
  let lastAnimationAt = null;

  const clamp = (value) => Math.max(0, Math.min(1, value));

  function pulseIcon(index) {
    if (reducedMotion.matches) return;
    const icon = steps[index].querySelector(".career-icon");
    icon.classList.remove("is-pulsing");
    void icon.offsetWidth;
    icon.classList.add("is-pulsing");
  }

  function measureStrikeLines() {
    needsMeasure = false;
    if (!document.createRange) return;

    const range = document.createRange();
    steps.slice(0, -1).forEach((step, index) => {
      const copy = step.querySelector(".career-step-copy");
      const copyRect = copy.getBoundingClientRect();
      let layer = copy.querySelector(".career-strike-layer");
      if (!layer) {
        layer = document.createElement("span");
        layer.className = "career-strike-layer";
        layer.setAttribute("aria-hidden", "true");
        copy.append(layer);
      }

      const fragment = document.createDocumentFragment();
      const measuredLines = [];
      [".career-step-name", ".career-step-role", ".career-step-years"].forEach((selector) => {
        const part = copy.querySelector(selector);
        const text = part.querySelector(".career-step-name-text") || part;
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const rects = [];
        while (walker.nextNode()) {
          range.selectNodeContents(walker.currentNode);
          [...range.getClientRects()].forEach((rect) => {
            if (rect.width <= 0) return;
            const line = rects.find((item) => Math.abs(item.top - rect.top) < 1);
            if (line) {
              line.left = Math.min(line.left, rect.left);
              line.right = Math.max(line.right, rect.right);
            } else {
              rects.push({ left: rect.left, right: rect.right, top: rect.top, height: rect.height });
            }
          });
        }
        const color = window.getComputedStyle(part).color;
        rects.forEach((rect) => {
          const line = document.createElement("span");
          line.className = "career-strike-line";
          line.style.left = `${rect.left - copyRect.left}px`;
          line.style.top = `${rect.top - copyRect.top + rect.height * 0.5}px`;
          line.style.width = `${rect.right - rect.left}px`;
          line.style.backgroundColor = color;
          fragment.append(line);
          measuredLines.push(line);
        });
      });
      layer.replaceChildren(fragment);
      strikeLines[index] = measuredLines;
    });
    section.querySelector(".career-scroll").classList.toggle(
      "has-strike-lines", strikeLines.slice(0, -1).every((group) => group.length > 0),
    );
  }

  function renderStrikeLines(index, progress) {
    const group = strikeLines[index];
    group.forEach((line, lineIndex) => {
      line.style.transform = `scaleX(${clamp(progress * group.length - lineIndex)})`;
    });
  }

  function getReadingY() {
    const viewportTop = visualViewport?.offsetTop || 0;
    const viewportHeight = visualViewport?.height || window.innerHeight;
    const islandHeight = contactIsland?.offsetHeight || 0;
    // Reserve the island's resting footprint, not its animated entrance position.
    // Its computed bottom already includes max(32px, env(safe-area-inset-bottom)).
    const bottomGap = islandHeight ? Math.max(0, parseFloat(window.getComputedStyle(contactIsland).bottom) || 0) : 0;
    const usableHeight = Math.max(1, viewportHeight - islandHeight - bottomGap);
    return viewportTop + usableHeight * 0.25;
  }

  function render(timestamp) {
    frame = 0;
    if (!mobile.matches) {
      hasRendered = false;
      lastAnimationAt = null;
      return;
    }

    if (needsMeasure) measureStrikeLines();

    // Start the whole sequence only when the company reaches the upper quarter
    // of the area above the contact island. Keep the connector-sized scroll range.
    const readingY = getReadingY();
    const lineProgress = lines.map((line, index) => {
      const rect = line.getBoundingClientRect();
      const stepTop = steps[index].getBoundingClientRect().top;
      return clamp((readingY - stepTop) / Math.max(1, rect.height));
    });
    const nextIndex = lineProgress.filter((progress) => progress >= 1).length;
    const elapsed = lastAnimationAt === null ? 0 : Math.max(0, timestamp - lastAnimationAt);
    let animating = false;

    lines.forEach((line, index) => {
      line.style.setProperty("--career-fill", String(lineProgress[index]));
    });
    steps.forEach((step, index) => {
      if (index < 3) {
        const target = index < nextIndex ? 1 : 0;
        if (!hasRendered || reducedMotion.matches) {
          strikeProgresses[index] = target;
        } else if (strikeProgresses[index] !== target) {
          const direction = Math.sign(target - strikeProgresses[index]);
          strikeProgresses[index] = clamp(strikeProgresses[index] + direction * elapsed / strikeDuration);
          animating ||= strikeProgresses[index] !== target;
        }
        step.style.setProperty("--career-strike-progress", String(strikeProgresses[index]));
        renderStrikeLines(index, strikeProgresses[index]);
      }
      const wasComplete = step.classList.contains("is-complete");
      const isComplete = index < nextIndex;
      step.classList.toggle("is-complete", isComplete);
      if (hasRendered && !wasComplete && isComplete && index < steps.length - 1) {
        document.dispatchEvent(new Event("portfolio:career-step-complete"));
      }
      if (index === nextIndex) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });

    if (hasRendered && nextIndex !== activeIndex) pulseIcon(nextIndex);
    activeIndex = nextIndex;
    hasRendered = true;
    lastAnimationAt = animating ? timestamp : null;
    if (animating) queueRender();
  }

  function queueRender() {
    if (!frame) frame = window.requestAnimationFrame(render);
  }

  steps.forEach((step) => {
    step.querySelector(".career-icon").addEventListener("animationend", (event) => {
      if (event.animationName === "career-icon-pulse") event.currentTarget.classList.remove("is-pulsing");
    });
  });

  window.addEventListener("scroll", queueRender, { passive: true });
  window.addEventListener("resize", () => { needsMeasure = true; queueRender(); }, { passive: true });
  visualViewport?.addEventListener("resize", queueRender, { passive: true });
  visualViewport?.addEventListener("scroll", queueRender, { passive: true });
  if (contactIsland && "ResizeObserver" in window) {
    new window.ResizeObserver(queueRender).observe(contactIsland);
  }
  mobile.addEventListener("change", () => { needsMeasure = true; queueRender(); });
  reducedMotion.addEventListener("change", queueRender);
  document.fonts?.ready.then(() => { needsMeasure = true; queueRender(); });
  queueRender();
})();
