/* Browser access is deferred until mount; safe to import during SSR. */
const InteractionDemos = (() => {
  const mounted = new WeakMap();
  const attempted = new Set();
  const noop = { manual() {}, refresh() {}, destroy() {}, get running() { return false; } };
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

  // Normalized portrait coordinates; 650 ms in, 600 ms hold, 650 ms back, 300 ms tail.
  function portraitPath(ms) {
    const enter = ease(ms / 650);
    const leave = ease((ms - 1250) / 650);
    return { x: .16 + .28 * enter * (1 - leave), y: .42,
      radius: 1.3 * enter * (1 - leave), decay: ms < 1250 ? 2.5 : .3 };
  }

  function mount({ target, key, delay, duration, threshold = .58, media = [], ready = () => true,
    settleOnScroll = false, persistOnStart = false, onStart = () => {}, onFrame = () => {}, onStop = () => {} }, environment = {}) {
    const win = environment.window || (typeof window !== "undefined" ? window : null);
    const doc = environment.document || (typeof document !== "undefined" ? document : null);
    if (!win || !doc || !target || !win.IntersectionObserver) return noop;
    let instances = mounted.get(target);
    if (!instances) { instances = new Map(); mounted.set(target, instances); }
    if (instances.has(key)) return instances.get(key);
    const motion = win.matchMedia("(prefers-reduced-motion: reduce)");
    // Consume each hint once per page load, but let a real reload show it again.
    let done = attempted.has(key);
    let timer = null;
    let frame = null;
    let startedAt = null;
    let inView = false;
    let destroyed = false;
    let suspended = false;
    let pageReady = doc.readyState === "complete";
    const listeners = [];
    const listen = (node, event, fn, options) => {
      node.addEventListener(event, fn, options);
      listeners.push(() => node.removeEventListener(event, fn, options));
    };
    function remember() {
      done = true;
      attempted.add(key);
    }
    function clearTimer() { if (timer !== null) win.clearTimeout(timer); timer = null; }
    function eligible() {
      return !destroyed && !suspended && pageReady && inView && target.isConnected &&
        doc.visibilityState === "visible" && !motion.matches && media.every(query => query.matches) && ready();
    }
    function measure() {
      const rect = target.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
      const visibleWidth = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0));
      // A collage taller than the viewport must still be discoverable on a laptop.
      return visibleWidth > 0 && visibleHeight >= threshold * Math.min(rect.height, win.innerHeight);
    }
    function stop(reason) {
      clearTimer();
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      const wasRunning = startedAt !== null;
      startedAt = null;
      if (wasRunning) {
        done = true;
        attempted.add(key);
        onStop(reason);
      }
    }
    function tick(now) {
      frame = null;
      inView = measure();
      if (!eligible()) { stop("interrupted"); return; }
      const elapsed = now - startedAt;
      if (elapsed >= duration) { remember(); stop("complete"); return; }
      onFrame(elapsed);
      if (startedAt !== null) frame = win.requestAnimationFrame(tick);
    }
    function refresh() {
      if (destroyed) return;
      if (!target.isConnected) { destroy(); return; }
      inView = measure();
      if (!eligible()) { stop("interrupted"); return; }
      if (done || timer !== null || startedAt !== null) return;
      timer = win.setTimeout(() => {
        timer = null;
        inView = measure();
        if (done || !eligible()) return;
        startedAt = win.performance.now();
        attempted.add(key);
        if (persistOnStart) remember();
        onStart();
        onFrame(0);
        frame = win.requestAnimationFrame(tick);
      }, delay);
    }
    function destroy() {
      if (destroyed) return;
      stop("destroy");
      destroyed = true;
      observer.disconnect();
      listeners.forEach(remove => remove());
      instances.delete(key);
    }
    const api = { refresh, destroy, manual() { remember(); stop("manual"); },
      get running() { return startedAt !== null; } };
    instances.set(key, api);
    const observer = new win.IntersectionObserver(refresh, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    observer.observe(target);
    listen(doc, "visibilitychange", refresh);
    listen(win, "load", () => { pageReady = true; refresh(); });
    listen(win, "resize", refresh);
    listen(win, "scroll", () => {
      if (settleOnScroll && startedAt === null) clearTimer();
      refresh();
    }, { passive: true });
    [motion, ...media].forEach(query => listen(query, "change", refresh));
    listen(win, "pagehide", event => {
      if (!event.persisted) { destroy(); return; }
      suspended = true;
      stop("interrupted");
      observer.disconnect();
    });
    listen(win, "pageshow", event => {
      if (!event.persisted) return;
      suspended = false;
      observer.observe(target);
      refresh();
    });
    return api;
  }
  return { mount, portraitPath, ease };
})();
