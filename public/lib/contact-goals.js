(() => {
  const installed = Symbol.for('portfolio.contactGoals');
  if (document[installed]) return;
  document[installed] = true;

  const placements = [
    ['.actions', 'hero'],
    ['.contact-island', 'floating_home'],
    ['.contact', 'footer'],
    ['.anchor-menu-contacts', 'floating_case'],
  ];

  function trackContact(event) {
    if (!event.isTrusted || event.defaultPrevented) return;
    if (event.type === 'click' ? event.button !== 0 : event.button !== 1) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || link.closest('[inert]') || link.getAttribute('aria-disabled') === 'true') return;
    const placement = placements.find(([selector]) => link.closest(selector))?.[1];
    if (!placement || typeof window.ym !== 'function') return;

    let url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    let goal;
    if (url.protocol === 'mailto:') goal = 'email_click';
    else if (url.protocol === 'https:' && ['t.me', 'telegram.me'].includes(url.hostname)) goal = 'telegram_click';
    else if (url.origin === window.location.origin && ['/cv_zlobin.pdf', '/public/cv_zlobin.pdf'].includes(url.pathname)) goal = 'cv_open';
    if (!goal) return;

    // Keep native links working even when analytics is blocked or unavailable.
    // One delegated event covers nested labels, touch, keyboard and middle click.
    try {
      window.ym(113693140, 'reachGoal', `${goal}_${placement}`, {
        contact_placement: placement,
        contact_page: window.location.pathname,
      });
    } catch { /* Analytics must never interrupt contact links. */ }
  }

  document.addEventListener('click', trackContact, { capture: true, passive: true });
  document.addEventListener('auxclick', trackContact, { capture: true, passive: true });
})();
