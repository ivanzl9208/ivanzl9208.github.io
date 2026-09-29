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
  const doc = environment.document || win.document;
  const visual = video.parentElement;
  const isB2B = video.classList.contains('project-b2b-video');
  const isLegacy = video.classList.contains('project-legacy-video');
  const earlyB2B = isB2B && (win.matchMedia?.('(max-width: 599px)').matches ?? win.innerWidth < 600);
  const poster = isLegacy ? video.previousElementSibling : null;
  const listeners = [];
  let frame = null, raf = null, probe = null, pending = null, generation = 0, playing = false, needsResume = false, destroyed = false;
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
    if (probe !== null) win.clearTimeout(probe);
    frame = raf = probe = null;
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
    if (frame !== null || raf !== null || probe !== null || video.classList.contains('is-ready')) return;
    const expected = generation;
    const presentedFrames = () => {
      const quality = video.getVideoPlaybackQuality?.();
      if (Number.isFinite(quality?.totalVideoFrames)) {
        return quality.totalVideoFrames - (quality.droppedVideoFrames || 0);
      }
      return Number.isFinite(video.webkitDecodedFrameCount) ? video.webkitDecodedFrameCount : null;
    };
    const framesAtStart = isLegacy ? presentedFrames() : null;
    const reveal = () => {
      if (destroyed || expected !== generation) return;
      if (isLegacy) {
        if (probe !== null) win.clearTimeout(probe);
        if (frame !== null) video.cancelVideoFrameCallback(frame);
      }
      frame = raf = probe = null;
      if (!playing || video.paused || video.error || video.readyState < 2) return;
      video.classList.add('is-ready');
      visual.classList.add('is-video-ready');
    };
    const probeFrameCounter = () => {
      if (framesAtStart === null || typeof win.setTimeout !== 'function') return false;
      let checks = 0;
      const check = () => {
        probe = null;
        if (destroyed || expected !== generation || !playing || video.paused || video.error) return;
        const frames = presentedFrames();
        if (frames !== null && frames > framesAtStart && video.readyState >= 2) reveal();
        else probe = win.setTimeout(check, ++checks < 60 ? 150 : 1000);
      };
      probe = win.setTimeout(check, 150);
      return true;
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      frame = video.requestVideoFrameCallback(reveal);
      if (isLegacy) probeFrameCounter();
    } else if (isLegacy) {
      // Without a frame API or counter, keep the original poster rather than guess.
      probeFrameCounter();
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
  if (isLegacy) listen(video, 'canplay', () => {
    if (!needsResume) return;
    needsResume = false;
    play();
    if (!video.paused) onPlaying();
  });
  for (const type of ['error', 'abort']) listen(video, type, unavailable);
  for (const type of ['emptied', 'loadstart']) listen(video, type, fallback);
  listen(video, 'pause', isLegacy ? () => { needsResume = false; fallback(); } : fallback);
  if (isLegacy) for (const type of ['waiting', 'stalled']) listen(video, type, () => {
    if (playing || !video.paused) needsResume = true;
    fallback();
  });
  if (poster) {
    const decodePoster = () => { poster.decode?.().catch(() => {}); };
    if (poster.complete && poster.naturalWidth) decodePoster();
    else listen(poster, 'load', decodePoster);
  }
  const startNearViewport = () => {
    if (!hydrated) hydrated = hydrateDeferredVideo(video);
    play();
  };
  const observer = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(([entry]) => { if (entry.isIntersecting) startNearViewport(); }, {
      threshold: .01,
      rootMargin: `${Math.ceil((win.innerHeight || 800) * (earlyB2B ? .75 : .25))}px 0px`,
    })
    : null;
  observer?.observe(video);
  if (!observer) startNearViewport();
  else if (hydrated && video.readyState >= 2) play();
  // A cached autoplay video may already be running when this script runs.
  if (!video.paused && video.readyState >= 2) onPlaying();
  const resume = () => { play(); if (!video.paused) onPlaying(); };
  if (isLegacy && doc?.addEventListener) listen(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') fallback();
    else resume();
  });
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
