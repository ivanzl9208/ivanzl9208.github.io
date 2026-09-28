(() => {
  const dialog = document.getElementById("agency-modal");
  const openers = document.querySelectorAll("[data-open-agency-modal]");
  if (!dialog || !openers.length) return;

  const heading = dialog.querySelector("#agency-modal-title");
  const closeButton = dialog.querySelector(".agency-modal-close");
  const scrollArea = dialog.querySelector(".agency-modal-scroll");
  const menu = window.createAnchorMenu(dialog.querySelector(".agency-modal-navigation"));
  let opener = null;
  let openedByPointer = false;
  let scrollY = 0;
  let previousStyles = null;

  function lockScroll() {
    const body = document.body;
    const root = document.documentElement;
    scrollY = window.scrollY;
    previousStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: root.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    root.style.overflow = "hidden";
  }

  function unlockScroll() {
    if (!previousStyles) return;
    const body = document.body;
    const root = document.documentElement;
    body.style.position = previousStyles.position;
    body.style.top = previousStyles.top;
    body.style.left = previousStyles.left;
    body.style.right = previousStyles.right;
    body.style.width = previousStyles.width;
    root.style.overflow = previousStyles.overflow;
    previousStyles = null;

    const scrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, scrollY);
    if (opener?.isConnected) {
      if (openedByPointer) {
        const returnTarget = opener;
        returnTarget.classList.add("agency-modal-pointer-return");
        returnTarget.addEventListener("blur", () => {
          returnTarget.classList.remove("agency-modal-pointer-return");
        }, { once: true });
      }
      opener.focus({ preventScroll: true });
    }
    root.style.scrollBehavior = scrollBehavior;
    opener = null;
    openedByPointer = false;
  }

  openers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      if (dialog.open) return;
      opener = trigger;
      openedByPointer = event.detail > 0;
      trigger.classList.remove("agency-modal-pointer-return");
      lockScroll();
      menu.schedule();
      dialog.showModal();
      scrollArea.scrollTop = 0;
      heading.focus({ preventScroll: true });
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { menu.cancel(); unlockScroll(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("a[href], button:not([disabled])")].filter((element) => !element.closest("[inert]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
