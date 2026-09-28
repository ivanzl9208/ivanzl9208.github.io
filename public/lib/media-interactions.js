/* CSS handles Safari callouts/selection/drag. Chromium touch menus additionally
 * need contextmenu cancellation. Never cancel activation or scrolling events. */
(() => {
  const mediaSelector = 'img, picture, video, canvas, svg, [role="img"], [data-ui-media], .sticker, .emoji-reaction';
  const nativeSelector = '[data-native-media], [contenteditable]:not([contenteditable="false"]), input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select';
  let lastPointer = null;

  document.addEventListener('pointerdown', event => {
    lastPointer = { type: event.pointerType, target: event.target, at: Date.now() };
  }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { lastPointer = null; }, { capture: true, passive: true });
  window.addEventListener('blur', () => { lastPointer = null; });

  document.addEventListener('contextmenu', event => {
    const target = event.target;
    if (!target?.closest || target.closest(nativeSelector)) return;
    const media = target.closest(mediaSelector);
    if (!media) return;

    // Older contextmenu events are MouseEvents without pointerType. Only use
    // the fallback for a recent touch on this media, never a mouse/keyboard menu.
    const fromTouch = event.pointerType
      ? event.pointerType === 'touch'
      : event.sourceCapabilities?.firesTouchEvents ||
        (lastPointer?.type === 'touch' && Date.now() - lastPointer.at < 5000 && media.contains(lastPointer.target));
    if (fromTouch) event.preventDefault();
  });
})();
