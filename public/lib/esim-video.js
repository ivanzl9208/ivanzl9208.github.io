// Case videos keep an independent first-frame image until real playback.
function hydrateDeferredVideo(video) {
  const sources = [...video.querySelectorAll('source[data-src]')];
  if (!sources.length) return false;
  sources.forEach(source => {
    source.src = source.dataset.src;
    source.removeAttribute('data-src');
  });
  video.preload = 'auto';
  video.load();
  return true;
}

function mountProjectVideo(video, environment = {}) {
  const win = environment.window || window;
  const visual = video.parentElement;
  const listeners = [];
  let frame = null, raf = null, pending = null, generation = 0, playing = false, destroyed = false;
  let hydrated = !video.hasAttribute?.('data-deferred-media');
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  function fallback() {
    generation++;
    pending = null;
    playing = false;
    if (frame !== null) video.cancelVideoFrameCallback(frame);
    if (raf !== null) win.cancelAnimationFrame(raf);
    frame = raf = null;
    video.classList.remove('is-ready');
    visual.classList.remove('is-video-ready');
  }
  function unavailable() {
    fallback();
    video.classList.add('is-unavailable');
  }
  function onPlaying() {
    if (destroyed || video.paused || video.error) return;
    playing = true;
    video.classList.remove('is-unavailable');
    if (frame !== null || raf !== null || video.classList.contains('is-ready')) return;
    const expected = generation;
    const reveal = () => {
      if (destroyed || expected !== generation) return;
      frame = raf = null;
      if (!playing || video.paused || video.error || video.readyState < 2) return;
      video.classList.add('is-ready');
      visual.classList.add('is-video-ready');
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      frame = video.requestVideoFrameCallback(reveal);
    } else {
      // Older engines: only after playing, decoded data and a paint opportunity.
      raf = win.requestAnimationFrame(() => { raf = win.requestAnimationFrame(reveal); });
    }
  }
  function play() {
    if (destroyed || !hydrated || video.error || pending !== null || !video.paused) return;
    video.classList.remove('is-unavailable');
    const attempt = { generation };
    pending = attempt;
    try {
      Promise.resolve(video.play()).catch(() => {
        if (!destroyed && pending === attempt && generation === attempt.generation) unavailable();
      }).finally(() => { if (pending === attempt) pending = null; });
    } catch { if (pending === attempt) unavailable(); }
  }
  listen(video, 'playing', onPlaying);
  listen(video, 'loadeddata', play);
  for (const type of ['error', 'abort']) listen(video, type, unavailable);
  for (const type of ['emptied', 'loadstart', 'pause']) listen(video, type, fallback);
  const startNearViewport = () => {
    if (!hydrated) hydrated = hydrateDeferredVideo(video);
    play();
  };
  const observer = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(([entry]) => { if (entry.isIntersecting) startNearViewport(); }, {
      threshold: .01,
      rootMargin: `${Math.ceil((win.innerHeight || 800) * .25)}px 0px`,
    })
    : null;
  observer?.observe(video);
  if (!observer) startNearViewport();
  else if (hydrated && video.readyState >= 2) play();
  // A cached autoplay video may already be running when this script runs.
  if (!video.paused && video.readyState >= 2) onPlaying();
  const resume = () => { play(); if (!video.paused) onPlaying(); };
  listen(win, 'pageshow', resume);
  listen(win, 'pagehide', event => { if (event.persisted) fallback(); else destroy(); });
  function destroy() {
    destroyed = true;
    fallback();
    observer?.disconnect();
    listeners.forEach(remove => remove());
  }
  return { destroy };
}

function mountAmbientVideo(video, environment = {}) {
  const win = environment.window || window;
  const poster = video.previousElementSibling?.classList.contains('photo-baby-poster')
    ? video.previousElementSibling : null;
  let hydrated = !video.hasAttribute?.('data-deferred-media');
  let frame = null, raf = null;
  const showPoster = () => {
    poster?.classList.remove('is-video-ready');
    if (frame !== null) video.cancelVideoFrameCallback?.(frame);
    if (raf !== null) win.cancelAnimationFrame(raf);
    frame = raf = null;
  };
  const onPlaying = () => {
    if (!poster || frame !== null || raf !== null) return;
    const reveal = () => {
      frame = raf = null;
      if (!video.paused && !video.error && video.readyState >= 2) poster.classList.add('is-video-ready');
    };
    if (typeof video.requestVideoFrameCallback === 'function') frame = video.requestVideoFrameCallback(reveal);
    else raf = win.requestAnimationFrame(() => { raf = win.requestAnimationFrame(reveal); });
  };
  const start = () => {
    if (!hydrated) hydrated = hydrateDeferredVideo(video);
    if (!hydrated || !video.paused) return;
    try { Promise.resolve(video.play()).catch(() => {}); } catch { /* Keep the poster. */ }
  };
  const observer = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(([entry]) => { if (entry.isIntersecting) start(); }, {
      threshold: .01,
      rootMargin: `${Math.ceil((win.innerHeight || 800) * .25)}px 0px`,
    })
    : null;
  observer?.observe(video);
  if (!observer) start();
  const resume = () => { if (hydrated) start(); };
  video.addEventListener('playing', onPlaying);
  for (const type of ['pause', 'error', 'emptied', 'abort']) video.addEventListener(type, showPoster);
  if (!video.paused && video.readyState >= 2) onPlaying();
  win.addEventListener('pageshow', resume);
  win.addEventListener('pagehide', showPoster);
  return { destroy() {
    showPoster();
    observer?.disconnect();
    video.removeEventListener('playing', onPlaying);
    for (const type of ['pause', 'error', 'emptied', 'abort']) video.removeEventListener(type, showPoster);
    win.removeEventListener('pageshow', resume);
    win.removeEventListener('pagehide', showPoster);
  } };
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('.project-chip-video, .project-b2b-video, .project-legacy-video').forEach(video => mountProjectVideo(video));
  document.querySelectorAll('video.photo-baby[data-deferred-media]').forEach(video => mountAmbientVideo(video));
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mountProjectVideo, mountAmbientVideo };
