// Shared entrance for case pages and the agency dialog.
// The homepage keeps its existing scroll-triggered visibility controller.
window.createAnchorMenu = function (element) {
  let frame;
  function cancel() {
    cancelAnimationFrame(frame);
    frame = undefined;
    if (!element) return;
    element.classList.remove('is-visible');
    element.setAttribute('aria-hidden', 'true');
    element.inert = true;
  }
  function schedule() {
    cancel();
    if (!element) return;
    // Paint the hidden state first so opening a dialog also gets the shared
    // CSS transition, without an additional timed pause.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        element.inert = false;
        element.setAttribute('aria-hidden', 'false');
        element.classList.add('is-visible');
      });
    });
  }
  return { schedule, cancel };
};
