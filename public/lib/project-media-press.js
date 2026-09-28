/* Touch-only hold detection. Visuals use the existing project zoom transition. */
const ProjectMediaPress = (() => {
  function bind(selector, environment = {}) {
    const win = environment.window || window;
    const doc = environment.document || document;
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = [];
    const touchedMedia = new Set();
    let press = null, timer = null;
    function listen(target, type, fn, capture = false) {
      target.addEventListener(type, fn, { passive: true, capture });
      listeners.push(() => target.removeEventListener(type, fn, capture));
    }
    function reset() {
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      press?.media.removeAttribute('data-media-held');
      press = null;
    }
    function inside(event, media) {
      const r = media.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right &&
        event.clientY >= r.top && event.clientY <= r.bottom;
    }
    function restoreMouseHover(event) {
      if (event.pointerType !== 'mouse') return;
      const media = event.target.closest?.(selector);
      media?.removeAttribute('data-media-touch');
      touchedMedia.delete(media);
    }
    listen(doc, 'pointerdown', event => {
      restoreMouseHover(event);
      if (press && event.pointerId !== press.id) { reset(); return; }
      if (press || event.pointerType !== 'touch' || event.isPrimary === false ||
          event.button > 0 || reduced.matches || doc.visibilityState !== 'visible') return;
      const media = event.target.closest?.(selector);
      if (!media || !inside(event, media) || event.target.closest('[data-native-media]')) return;
      // On hybrid tablets, do not let synthetic/sticky :hover bypass the timer.
      media.setAttribute('data-media-touch', '');
      touchedMedia.add(media);
      press = { id: event.pointerId, media, x: event.clientX, y: event.clientY };
      timer = win.setTimeout(() => {
        timer = null;
        if (press?.media.isConnected && !reduced.matches && doc.visibilityState === 'visible') {
          press.media.setAttribute('data-media-held', '');
        } else reset();
      }, 300);
    });
    listen(doc, 'pointermove', event => {
      restoreMouseHover(event);
      if (event.pointerId !== press?.id) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10 || !inside(event, press.media)) reset();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(doc, type, event => { if (event.pointerId === press?.id) reset(); });
    }
    listen(doc, 'scroll', reset, true);
    listen(win, 'blur', reset);
    listen(win, 'resize', reset);
    listen(win, 'pagehide', reset);
    listen(doc, 'visibilitychange', () => { if (doc.visibilityState !== 'visible') reset(); });
    listen(reduced, 'change', reset);
    return { destroy() {
      reset(); listeners.forEach(remove => remove());
      touchedMedia.forEach(media => media.removeAttribute('data-media-touch'));
      touchedMedia.clear();
    } };
  }
  return { bind };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProjectMediaPress;
