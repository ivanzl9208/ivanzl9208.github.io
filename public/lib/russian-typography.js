/* Keep short Russian function words with the word that follows them. */
const russianKeepWithNext = new Set([
  "а", "без", "в", "во", "да", "для", "до", "за", "и", "из", "или", "к",
  "как", "ко", "на", "над", "не", "ни", "но", "о", "об", "обо", "от",
  "по", "под", "при", "про", "с", "со", "у", "что",
]);
const russianMobileExceptions = new Set(["над"]);

// A preceding NBSP is an author's explicit grouping; don't extend it into a long chain.
const russianWordCharacter = /[\p{L}\p{N}_-\u00a0]/u;
const russianShortWordSpace = /([А-Яа-яЁё]{1,4}) (?=(?:[«„“"'(\[])*[\p{L}\p{N}])/gu;
const russianTrailingShortWord = /([А-Яа-яЁё]{1,4}) $/u;
const russianInlineTags = new Set(["A", "B", "CITE", "EM", "I", "LABEL", "MARK", "SMALL", "SPAN", "STRONG", "SUB", "SUP"]);

function typographRussianText(text, nextInlineWord = false, isMobile = false) {
  const startsWord = (source, offset) => offset === 0 || !russianWordCharacter.test(source[offset - 1]);
  const shouldKeep = (word) => {
    const lower = word.toLowerCase();
    return russianKeepWithNext.has(lower) && !(isMobile && russianMobileExceptions.has(lower));
  };
  let result = text.replace(russianShortWordSpace, (match, word, offset, source) =>
    startsWord(source, offset) && shouldKeep(word) ? `${word}\u00a0` : match,
  );
  if (nextInlineWord) {
    result = result.replace(russianTrailingShortWord, (match, word, offset, source) =>
      startsWord(source, offset) && shouldKeep(word) ? `${word}\u00a0` : match,
    );
  }
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { typographRussianText };
}

if (typeof document !== "undefined" && document.body) {
  const mobile = window.matchMedia("(max-width: 599px)");
  const sourceText = new WeakMap();
  const trackedText = new Set();
  const ignoredElements = "script, style, noscript, template, pre, code, kbd, samp, textarea, svg, math, [contenteditable]";

  function isExcluded(node) {
    const parent = node.parentElement;
    return !parent || !!parent.closest(ignoredElements) ||
      !!parent.closest('[data-ru-typo="off"]') ||
      (mobile.matches && !!parent.closest('[data-ru-typo="off-mobile"]'));
  }

  function hasNextInlineWord(node) {
    let next = node.nextSibling;
    while (next?.nodeType === 8) next = next.nextSibling;
    if (!next) return false;
    if (next.nodeType === 3) return /^[«„“"'(\[]*[\p{L}\p{N}]/u.test(next.data);
    if (next.nodeType !== 1 || !russianInlineTags.has(next.tagName) ||
        next.matches('[data-ru-typo="off"]')) return false;
    return /^[«„“"'(\[]*[\p{L}\p{N}]/u.test(next.textContent.trimStart());
  }

  function processTextNode(node) {
    if (!node.isConnected) {
      trackedText.delete(node);
      return;
    }

    let state = sourceText.get(node);
    if (!state || node.data !== state.rendered) {
      state = { source: node.data, rendered: node.data };
      sourceText.set(node, state);
    }

    const result = isExcluded(node) ? state.source :
      typographRussianText(state.source, hasNextInlineWord(node), mobile.matches);
    state.rendered = result;
    trackedText.add(node);
    if (node.data !== result) node.data = result;
  }

  function applyRussianTypography(root = document.body) {
    if (root.nodeType === 3) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) processTextNode(walker.currentNode);
  }

  function untrackText(root) {
    if (root.nodeType === 3) {
      trackedText.delete(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) trackedText.delete(walker.currentNode);
  }

  applyRussianTypography();
  mobile.addEventListener("change", () => {
    for (const node of trackedText) processTextNode(node);
  });

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") processTextNode(record.target);
      else {
        if (record.type === "childList") {
          for (const node of record.removedNodes) untrackText(node);
        }
        applyRussianTypography(record.target);
      }
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-ru-typo"],
  });

  window.applyRussianTypography = applyRussianTypography;
}
