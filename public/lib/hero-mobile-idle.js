const mountedPortraits = new WeakMap();

/** Start the muted touch portrait immediately, regardless of viewport width. */
export function mountMobilePortrait(container, environment = {}) {
  if (mountedPortraits.has(container)) return mountedPortraits.get(container);
  const win = environment.window || window;
  const doc = environment.document || document;
  const nav = environment.navigator || navigator;
  const touch = win.matchMedia("(hover: none), (pointer: coarse)");
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = nav.connection;
  const hero = container.closest(".hero") || container;
  const hapticSwitch = container.querySelector(".hero-haptic-switch");
  let video = null;
  let frameCallback = null;
  let revision = 0;
  let activePlay = false;
  let visible = false;
  let failed = false;
  let autoplayBlocked = false;
  let manualPlay = false;
  let suspended = false;
  let destroyed = false;
  let press = null;
  let suppressPointerClick = false;
  let allowHapticClick = false;
  const enterRatio = .5;
  const leaveRatio = .1;
  const outsideDwell = 1700;
  let intersectionRatio = 0;
  let autoAvailable = true;
  let outsideSince = null;
  const listeners = [];

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }

  function allowed() {
    return touch.matches && !reducedMotion.matches && !connection?.saveData;
  }

  function eligible(manual = false) {
    return !destroyed && !failed && !suspended && visible &&
      doc.visibilityState === "visible" && container.isConnected && touch.matches &&
      (manual || (allowed() && !autoplayBlocked));
  }

  function stop({ keepFrame = false } = {}) {
    cancelPress();
    revision += 1;
    activePlay = false;
    manualPlay = false;
    if (!keepFrame) container.removeAttribute("data-mobile-video-ready");
    if (!video) return;
    if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback);
    frameCallback = null;
    if (!keepFrame) video.hidden = true;
    video.pause();
    // Metadata is not always available after a failed or interrupted load.
    try { video.currentTime = 0; } catch { /* The static picture remains visible. */ }
  }

  function releaseVideo() {
    if (!video) return;
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("error", onError);
    video.removeAttribute("src");
    video.replaceChildren();
    video.load();
    video.remove();
    video = null;
  }

  function onError() {
    failed = true;
    stop();
    releaseVideo();
  }

  function onPlaying() {
    if (!eligible(manualPlay) || !activePlay) {
      stop();
      return;
    }
    // Older engines without frame callbacks can reveal on actual playback.
    if (!video.requestVideoFrameCallback) {
      container.setAttribute("data-mobile-video-ready", "");
    }
  }

  function onEnded() {
    // Keep the decoded first frame visible after the single playback instead of
    // swapping back to a separately color-managed image.
    stop({ keepFrame: true });
  }

  function ensureVideo() {
    if (video) return true;
    const candidate = doc.createElement("video");
    const renderedPixels = container.getBoundingClientRect().width * (win.devicePixelRatio || 1);
    const variant = renderedPixels <= 600 ? "-600" : "";
    const sources = [
      ["video/webm; codecs=vp9", `public/assets/hero-head-mobile-idle${variant}.webm`],
      ["video/mp4; codecs=avc1.640028", `public/assets/hero-head-mobile-idle${variant}.mp4`],
    ].filter(([type]) => candidate.canPlayType(type));
    if (!sources.length) {
      failed = true;
      return false;
    }
    candidate.className = "hero-head hero-head-mobile-video";
    candidate.width = 960;
    candidate.height = 960;
    const mp4Poster = sources[0][1].endsWith(".mp4");
    const posterStem = `public/assets/hero-head-mobile-poster${mp4Poster ? "-mp4" : ""}`;
    const poster = `${posterStem}${variant || "-960"}.webp`;
    candidate.poster = poster;
    const pictureSource = container.querySelector('picture source[data-hero-video-poster]');
    if (pictureSource && mp4Poster) {
      pictureSource.srcset = `${posterStem}-320.webp 320w, ${posterStem}-600.webp 600w, ${posterStem}-960.webp 960w`;
    }
    candidate.muted = true;
    candidate.defaultMuted = true;
    candidate.playsInline = true;
    candidate.preload = "auto";
    candidate.hidden = true;
    candidate.setAttribute("muted", "");
    candidate.setAttribute("playsinline", "");
    candidate.setAttribute("aria-hidden", "true");
    candidate.tabIndex = -1;
    for (const [type, src] of sources) {
      const source = doc.createElement("source");
      source.type = type;
      source.src = src;
      candidate.append(source);
    }
    video = candidate;
    candidate.addEventListener("playing", onPlaying);
    candidate.addEventListener("ended", onEnded);
    candidate.addEventListener("error", onError);
    container.append(candidate);
    candidate.load();
    return true;
  }

  function playNow(manual = false) {
    if (!eligible(manual) || activePlay || !ensureVideo()) return;
    const expectedRevision = revision;
    activePlay = true;
    manualPlay = manual;
    // Keep the picture above the visible video until a decoded frame is sent
    // to the compositor. WebKit requires a visible element for inline autoplay.
    video.hidden = false;
    try {
      if (video.requestVideoFrameCallback) {
        const playingVideo = video;
        frameCallback = video.requestVideoFrameCallback(() => {
          if (expectedRevision !== revision || playingVideo !== video) return;
          frameCallback = null;
          if (eligible(manualPlay) && activePlay) container.setAttribute("data-mobile-video-ready", "");
        });
      }
      const playback = video.play();
      Promise.resolve(playback).catch(error => {
        // A scroll, resize or tab switch deliberately aborts an in-flight play().
        if (expectedRevision !== revision || destroyed) return;
        if (!manual && error?.name === "NotAllowedError") {
          autoplayBlocked = true;
          stop();
        } else if (error?.name === "AbortError") {
          stop();
        } else {
          onError();
        }
      });
    } catch {
      if (expectedRevision === revision) onError();
    }
  }

  function onTap() {
    if (!touch.matches || destroyed || doc.visibilityState !== "visible") return;
    if (activePlay) return;
    visible = true;
    playNow(true);
  }

  function cancelPress() {
    press = null;
    allowHapticClick = false;
    container.removeAttribute("data-hero-pressed");
  }

  function withinPress(event) {
    const { bounds, x, y } = press;
    return Math.hypot(event.clientX - x, event.clientY - y) <= 10 &&
      event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  }

  function onPointerDown(event) {
    if (press && event.pointerId !== press.id) {
      cancelPress(); // A second finger, including outside the portrait, cancels the gesture.
      return;
    }
    if (event.pointerType === "mouse") {
      suppressPointerClick = false;
      return;
    }
    if (!touch.matches || event.isPrimary === false || event.button > 0 ||
        destroyed || suspended || doc.visibilityState !== "visible" ||
        !container.contains(event.target)) return;
    const bounds = container.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    suppressPointerClick = true;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, bounds,
      haptic: event.target === hapticSwitch };
    if (!reducedMotion.matches) container.setAttribute("data-hero-pressed", "");
  }

  function onPointerMove(event) {
    if (press && event.pointerId === press.id && !withinPress(event)) cancelPress();
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.id) return;
    const successful = withinPress(event);
    const waitForHapticClick = press.haptic;
    cancelPress();
    if (successful) {
      // The native mobile control starts playback in the same trusted click as
      // its haptic, not earlier on pointerup. Other activation paths stay intact.
      if (!waitForHapticClick) onTap();
      allowHapticClick = true;
    }
  }

  function onClick(event) {
    if (hapticSwitch && event.target === hapticSwitch) {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        event.preventDefault();
        if (!suppressPointerClick) onTap();
        return;
      }
      const successful = event.isTrusted && touch.matches &&
        !destroyed && !suspended && doc.visibilityState === "visible" &&
        (event.detail === 0 || !suppressPointerClick || allowHapticClick);
      allowHapticClick = false;
      if (!successful) {
        // Cancel the native switch activation too: no haptic after a scroll or drag.
        event.preventDefault();
        return;
      }
      // Safari supplies one native tap from this trusted input[switch] click,
      // just like the life-section stickers. Do not synthesize label clicks.
      // Browsers with Vibration API get one short pulse, without sound or a timer.
      try { Promise.resolve(nav.vibrate?.(15)).catch(() => {}); } catch { /* Haptics are optional. */ }
      onTap(); // No delay/await: preserve user activation; active playback is a no-op.
      return;
    }
    // Touch pointerup already handled this gesture, even if it was cancelled.
    // Keep click-only/keyboard activation and the existing narrow mouse behavior.
    if (!suppressPointerClick || event.detail === 0) onTap();
  }

  function sync() {
    if (touch.matches) container.setAttribute("data-hero-touch", "");
    else container.removeAttribute("data-hero-touch");
    if (!touch.matches || reducedMotion.matches || doc.visibilityState !== "visible") cancelPress();
    if (!container.isConnected) {
      destroy();
      return;
    }
    if (!eligible(manualPlay)) {
      stop();
      if (!allowed()) releaseVideo();
      return;
    }
  }

  function tryAutoPlay() {
    if (!autoAvailable || intersectionRatio < enterRatio || !eligible()) return;
    // This entry is spent even if a manual play is already in progress.
    autoAvailable = false;
    if (!activePlay) playNow();
  }

  function updateViewport(entries) {
    for (const entry of entries) {
      intersectionRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
      const at = entry.time ?? win.performance.now();
      if (intersectionRatio <= leaveRatio) {
        if (activePlay) stop();
        if (!autoAvailable && outsideSince === null) outsideSince = at;
      } else if (intersectionRatio > leaveRatio && outsideSince !== null) {
        if (at - outsideSince >= outsideDwell) autoAvailable = true;
        outsideSince = null;
      }
    }
    visible = intersectionRatio > leaveRatio;
    sync();
    tryAutoPlay();
  }

  const observer = typeof win.IntersectionObserver === "function"
    ? new win.IntersectionObserver(updateViewport,
      { threshold: [0, leaveRatio, enterRatio] })
    : null;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    observer?.disconnect();
    listeners.splice(0).forEach(remove => remove());
    releaseVideo();
    container.removeAttribute("data-hero-touch");
    mountedPortraits.delete(container);
  }

  mountedPortraits.set(container, destroy);
  if (touch.matches) container.setAttribute("data-hero-touch", "");
  listen(container, "click", onClick);
  if (hapticSwitch) listen(hapticSwitch, "keydown", (event) => {
    if (event.key !== "Enter" || event.repeat) return;
    event.preventDefault();
    hapticSwitch.checked = !hapticSwitch.checked;
    onTap();
  });
  listen(doc, "pointerdown", onPointerDown, { passive: true });
  listen(doc, "pointermove", onPointerMove, { passive: true });
  listen(doc, "pointerup", onPointerUp, { passive: true });
  listen(doc, "pointercancel", cancelPress, { passive: true });
  // Touch pointers leave/release implicit capture after pointerup, before click
  // in some engines. Only cancel a gesture still being held, not a finished tap.
  const cancelHeldPress = () => { if (press) cancelPress(); };
  listen(container, "pointerleave", cancelHeldPress, { passive: true });
  listen(container, "lostpointercapture", cancelHeldPress, { passive: true });
  listen(win, "scroll", cancelPress, { passive: true });
  listen(win, "blur", cancelPress);
  listen(win, "resize", cancelPress);
  const syncAutoPreference = () => { sync(); tryAutoPlay(); };
  listen(touch, "change", syncAutoPreference);
  listen(reducedMotion, "change", syncAutoPreference);
  if (connection?.addEventListener) listen(connection, "change", syncAutoPreference);
  listen(doc, "visibilitychange", sync);
  listen(win, "pagehide", event => {
    if (!event.persisted) {
      destroy();
      return;
    }
    suspended = true;
    visible = false;
    stop();
    observer?.disconnect();
  });
  listen(win, "pageshow", () => {
    if (!suspended) return;
    suspended = false;
    observer?.observe(hero);
  });
  observer?.observe(hero);
  return destroy;
}
