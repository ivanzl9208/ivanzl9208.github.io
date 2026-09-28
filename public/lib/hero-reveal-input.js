/* Shared input adapter for the existing WebGL and 2D portrait renderers.
 * Touch never captures the pointer or prevents the browser's vertical pan. */
const HeroRevealInput = (() => {
  function bind({ surface, target, enabled, hover, move, end }, environment = {}) {
    const win = environment.window || window;
    const doc = environment.document || document;
    const listeners = [];
    let contact = null, releaseFrame = null, lastContactAt = -Infinity;
    const listen = (node, type, fn) => {
      node.addEventListener(type, fn, { passive: true });
      listeners.push(() => node.removeEventListener(type, fn));
    };
    const inside = event => {
      const r = target.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right &&
        event.clientY >= r.top && event.clientY <= r.bottom;
    };
    function reset() {
      if (releaseFrame !== null) win.cancelAnimationFrame(releaseFrame);
      releaseFrame = null;
      contact = null;
      end();
    }
    listen(surface, 'mousemove', event => {
      if (enabled() && hover() && contact === null && !event.sourceCapabilities?.firesTouchEvents &&
          win.performance.now() - lastContactAt > 800) move(event);
    });
    listen(surface, 'mouseleave', () => { if (contact === null) end(); });
    listen(doc, 'pointerdown', event => {
      if (contact !== null && event.pointerId !== contact) { reset(); return; }
      if (!enabled() || !['touch', 'pen'].includes(event.pointerType) ||
          event.isPrimary === false || event.button > 0 ||
          !target.contains(event.target) || !inside(event)) return;
      if (releaseFrame !== null) win.cancelAnimationFrame(releaseFrame);
      releaseFrame = null;
      contact = event.pointerId;
      lastContactAt = win.performance.now();
      move(event);
    });
    listen(doc, 'pointermove', event => {
      if (event.pointerId !== contact) return;
      if (!enabled() || !inside(event)) { reset(); return; }
      move(event);
    });
    listen(doc, 'pointerup', event => {
      if (event.pointerId !== contact) return;
      contact = null;
      lastContactAt = win.performance.now();
      // Even a very quick tap gets one render before the existing fade-out.
      releaseFrame = win.requestAnimationFrame(() => { releaseFrame = null; end(); });
    });
    listen(doc, 'pointercancel', event => { if (event.pointerId === contact) reset(); });
    listen(win, 'scroll', () => { if (contact !== null || releaseFrame !== null) reset(); });
    listen(win, 'resize', reset);
    listen(win, 'blur', reset);
    listen(doc, 'visibilitychange', () => { if (doc.visibilityState !== 'visible') reset(); });
    return { reset, destroy() { reset(); listeners.forEach(remove => remove()); } };
  }
  return { bind };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HeroRevealInput;
