const maskReveal = document.querySelector("[data-mask-hover-reveal]");
const maskRevealCanvas = maskReveal?.querySelector(".hero-reveal-canvas");
const maskRevealImage = maskReveal?.querySelector(".hero-head-reveal");
const revealReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealViewport = window.matchMedia("(hover: hover) and (pointer: fine)");
const revealHoverPointer = revealViewport;
if (maskReveal) {
  import("./public/lib/hero-mobile-idle.js?v=20260928-1")
    .then(({ mountMobilePortrait }) => mountMobilePortrait(maskReveal))
    .catch(() => { /* Keep the static picture if the enhancement is unavailable. */ });
}

function mountPortraitDemo(container, adapter) {
  return InteractionDemos.mount({
    target: container, key: "portfolio:hero-reveal-demo:seen", delay: 1350, duration: 2200,
    media: [revealViewport], ready: adapter.ready,
    onFrame: ms => adapter.move(InteractionDemos.portraitPath(ms)), onStop: adapter.stop,
  });
}

function initWebGLMaskReveal(container, canvas, image) {
  const interactionSurface = container.closest(".hero") || container;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!gl) return false;

  const vertexShaderSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;

    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const maskShaderSource = `
    precision highp float;

    uniform float uTime;
    uniform float uDeltaTime;
    uniform float uAspect;
    uniform float uPointerRadius;
    uniform float uPointerDuration;
    uniform vec2 uPointer;
    uniform sampler2D uPreviousFrame;
    varying vec2 vUv;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float a = hash(cell);
      float b = hash(cell + vec2(1.0, 0.0));
      float c = hash(cell + vec2(0.0, 1.0));
      float d = hash(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
    }

    void main() {
      float mask = texture2D(uPreviousFrame, vUv).r;
      mask -= clamp(uDeltaTime / uPointerDuration, 0.0, 0.05);
      mask = clamp(mask, 0.0, 1.0);

      vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
      vec2 pointer = uPointer * vec2(uAspect, 1.0);
      vec2 toPointer = uv - pointer;
      float angle = atan(toPointer.y, toPointer.x);
      float distanceToPointer = length(toPointer);
      float noiseA = noise(vec2(angle * 3.0 + uTime * 0.5, distanceToPointer * 5.0));
      float noiseB = noise(vec2(angle * 5.0 - uTime * 0.3, distanceToPointer * 3.0 + uTime));
      float radiusVariation = 0.7 + noiseA * 0.5 + noiseB * 0.3;
      float organicRadius = uPointerRadius * radiusVariation;
      float addition = 1.0 - smoothstep(organicRadius * 0.05, organicRadius * 1.2, distanceToPointer);
      addition *= 0.8 + noiseA * 0.2;

      mask += addition * 0.25;
      gl_FragColor = vec4(vec3(clamp(mask, 0.0, 1.0)), 1.0);
    }
  `;

  const revealShaderSource = `
    precision highp float;

    uniform sampler2D uMask;
    uniform sampler2D uImage;
    uniform float uTime;
    uniform vec2 uImageOrigin;
    uniform vec2 uImageSize;
    varying vec2 vUv;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float a = hash(cell);
      float b = hash(cell + vec2(1.0, 0.0));
      float c = hash(cell + vec2(0.0, 1.0));
      float d = hash(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
    }

    float fbm(vec2 point) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int octave = 0; octave < 4; octave++) {
        value += amplitude * noise(point);
        point *= 2.1;
        amplitude *= 0.3;
      }
      return value;
    }

    void main() {
      float mask = texture2D(uMask, vUv).r;
      if (mask < 0.02) discard;

      vec2 imageUv = (vUv - uImageOrigin) / uImageSize;
      float insideImage = step(0.0, imageUv.x)
        * step(imageUv.x, 1.0)
        * step(0.0, imageUv.y)
        * step(imageUv.y, 1.0);
      vec4 imageColor = texture2D(uImage, clamp(imageUv, 0.0, 1.0));
      vec2 patternUv = vUv * 3.5;
      float distortion = fbm(vUv * 2.0 + uTime * 0.2);
      float pattern = fbm(patternUv + (distortion - 0.5) * 0.7);
      vec3 revealColor = vec3(15.0 / 255.0);
      float relief = mix(0.82, 1.18, smoothstep(0.1, 0.9, sin(pattern * 3.0)));
      vec3 blobBase = revealColor * relief;
      float line = 1.0 - smoothstep(0.49, 0.51, fract(pattern * 15.0));
      vec3 blobColor = mix(blobBase, revealColor * 1.35, line * 0.55);
      float subjectAlpha = imageColor.a * insideImage;
      float imageStrength = subjectAlpha;
      vec3 finalColor = mix(blobColor, imageColor.rgb, imageStrength);
      float edgeAlpha = smoothstep(0.02, 0.12, mask);

      gl_FragColor = vec4(finalColor, edgeAlpha);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Mask shader compilation failed");
    }
    return shader;
  }

  function createProgram(fragmentSource) {
    const program = gl.createProgram();
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message || "Mask shader linking failed");
    }
    return program;
  }

  let maskProgram;
  let revealProgram;
  try {
    maskProgram = createProgram(maskShaderSource);
    revealProgram = createProgram(revealShaderSource);
  } catch (error) {
    console.warn("Mask Hover Reveal is unavailable:", error);
    return false;
  }

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]), gl.STATIC_DRAW);

  const maskUniforms = {
    position: gl.getAttribLocation(maskProgram, "aPosition"),
    previousFrame: gl.getUniformLocation(maskProgram, "uPreviousFrame"),
    time: gl.getUniformLocation(maskProgram, "uTime"),
    deltaTime: gl.getUniformLocation(maskProgram, "uDeltaTime"),
    aspect: gl.getUniformLocation(maskProgram, "uAspect"),
    pointer: gl.getUniformLocation(maskProgram, "uPointer"),
    pointerRadius: gl.getUniformLocation(maskProgram, "uPointerRadius"),
    pointerDuration: gl.getUniformLocation(maskProgram, "uPointerDuration"),
  };
  const revealUniforms = {
    position: gl.getAttribLocation(revealProgram, "aPosition"),
    mask: gl.getUniformLocation(revealProgram, "uMask"),
    image: gl.getUniformLocation(revealProgram, "uImage"),
    time: gl.getUniformLocation(revealProgram, "uTime"),
    imageOrigin: gl.getUniformLocation(revealProgram, "uImageOrigin"),
    imageSize: gl.getUniformLocation(revealProgram, "uImageSize"),
  };
  const revealTexture = gl.createTexture();
  const maskTargets = [null, null];
  let activeTarget = 0;
  let frame = 0;
  let width = 1;
  let height = 1;
  let imageOriginX = 0;
  let imageOriginY = 0;
  let imageSizeX = 1;
  let imageSizeY = 1;
  let pointerRadius = 0.35;
  let elapsed = 0;
  let lastFrameAt = performance.now();
  let fadeUntil = 0;
  let pointerInside = false;
  let visible = true;
  let imageReady = image.complete && image.naturalWidth > 0;
  let pointerX = 10;
  let pointerY = 10;
  let demoState = null;
  let handoff = null;
  let manualX = 10;
  let manualY = 10;
  let portraitDemo;

  function pointerCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1 };
  }

  function bindQuad(position) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  }

  function configureTexture(texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function uploadRevealImage() {
    configureTexture(revealTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    imageReady = true;
  }

  function deleteMaskTarget(target) {
    if (!target) return;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  }

  function createMaskTarget(targetWidth, targetHeight) {
    const texture = gl.createTexture();
    configureTexture(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetWidth, targetHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer };
  }

  function clearMask() {
    gl.clearColor(0, 0, 0, 0);
    maskTargets.forEach((target) => {
      if (!target) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const imageRect = container.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    imageOriginX = (imageRect.left - rect.left) / width;
    imageOriginY = (rect.bottom - imageRect.bottom) / height;
    imageSizeX = imageRect.width / width;
    imageSizeY = imageRect.height / height;
    pointerRadius = 0.35 * imageSizeY;
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio));
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width === bufferWidth && canvas.height === bufferHeight && maskTargets[0]) return;

    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    deleteMaskTarget(maskTargets[0]);
    deleteMaskTarget(maskTargets[1]);
    maskTargets[0] = createMaskTarget(bufferWidth, bufferHeight);
    maskTargets[1] = createMaskTarget(bufferWidth, bufferHeight);
    activeTarget = 0;
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    clearMask();
  }

  function render(now) {
    frame = 0;
    if (!visible || !imageReady || revealReducedMotion.matches || !revealViewport.matches) {
      clearMask();
      return;
    }

    const deltaTime = Math.min(Math.max((now - lastFrameAt) / 1000, 0), 0.05);
    lastFrameAt = now;
    elapsed += deltaTime;
    let radiusScale = demoState?.radius ?? 1;
    let decay = demoState?.decay ?? 2.5;
    if (handoff) {
      const progress = InteractionDemos.ease((now - handoff.at) / 180);
      pointerX = handoff.x + (manualX - handoff.x) * progress;
      pointerY = handoff.y + (manualY - handoff.y) * progress;
      radiusScale = handoff.radius + (1 - handoff.radius) * progress;
      decay = handoff.decay + (2.5 - handoff.decay) * progress;
      if (progress === 1) handoff = null;
    }
    const nextTarget = activeTarget === 0 ? 1 : 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, maskTargets[nextTarget].framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(maskProgram);
    bindQuad(maskUniforms.position);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTargets[activeTarget].texture);
    gl.uniform1i(maskUniforms.previousFrame, 0);
    gl.uniform1f(maskUniforms.time, elapsed);
    gl.uniform1f(maskUniforms.deltaTime, deltaTime);
    gl.uniform1f(maskUniforms.aspect, width / height);
    gl.uniform2f(maskUniforms.pointer, pointerX, pointerY);
    gl.uniform1f(maskUniforms.pointerRadius, Math.max(.00001, pointerRadius * radiusScale));
    gl.uniform1f(maskUniforms.pointerDuration, decay);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    activeTarget = nextTarget;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(revealProgram);
    bindQuad(revealUniforms.position);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTargets[activeTarget].texture);
    gl.uniform1i(revealUniforms.mask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, revealTexture);
    gl.uniform1i(revealUniforms.image, 1);
    gl.uniform1f(revealUniforms.time, elapsed);
    gl.uniform2f(revealUniforms.imageOrigin, imageOriginX, imageOriginY);
    gl.uniform2f(revealUniforms.imageSize, imageSizeX, imageSizeY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


    if (demoState || pointerInside || now < fadeUntil) frame = window.requestAnimationFrame(render);
    else clearMask();
  }

  function queueRender() {
    if (!frame && visible && imageReady && !revealReducedMotion.matches && revealViewport.matches) {
      lastFrameAt = performance.now();
      frame = window.requestAnimationFrame(render);
    }
  }

  function updatePointer(event) {
    if (revealReducedMotion.matches || !revealViewport.matches) return;
    const rect = container.getBoundingClientRect();
    const isInside = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
    if (!isInside) {
      if (pointerInside) hide();
      return;
    }
    if (demoState) handoff = { x: pointerX, y: pointerY, radius: demoState.radius,
      decay: demoState.decay, at: performance.now() };
    portraitDemo?.manual();
    const next = pointerCoordinates(event.clientX, event.clientY);
    manualX = next.x;
    manualY = next.y;
    if (!handoff) { pointerX = manualX; pointerY = manualY; }
    pointerInside = true;
    queueRender();
  }

  function hide() {
    if (demoState) return;
    handoff = null;
    pointerInside = false;
    pointerX = 10;
    pointerY = 10;
    fadeUntil = performance.now() + 2600;
    queueRender();
  }

  function handlePreference() {
    if (revealReducedMotion.matches || !revealViewport.matches) {
      revealInput.reset();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      pointerInside = false;
      clearMask();
    }
  }

  const revealInput = HeroRevealInput.bind({
    surface: interactionSurface, target: container,
    enabled: () => revealViewport.matches && !revealReducedMotion.matches,
    hover: () => revealHoverPointer.matches, move: updatePointer, end: hide,
  });
  revealReducedMotion.addEventListener("change", handlePreference);
  revealViewport.addEventListener("change", handlePreference);

  if (imageReady) uploadRevealImage();
  else image.addEventListener("load", () => {
    uploadRevealImage();
    queueRender();
  }, { once: true });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      clearMask();
    } else if (pointerInside) {
      queueRender();
    }
  });
  visibilityObserver.observe(container);
  resize();
  portraitDemo = mountPortraitDemo(container, {
    ready: () => imageReady && !gl.isContextLost(),
    move(state) {
      demoState = state;
      const rect = container.getBoundingClientRect();
      const next = pointerCoordinates(rect.left + state.x * rect.width, rect.top + state.y * rect.height);
      pointerX = next.x;
      pointerY = next.y;
      queueRender();
    },
    stop(reason) {
      demoState = null;
      if (reason === "manual") return; // Keep the current mask for the 180 ms handoff.
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      pointerX = pointerY = 10;
      clearMask();
    },
  });
  image.addEventListener("load", portraitDemo.refresh, { once: true });

  HeroRevealInput.cleanupOnPageDiscard(window, () => {
    portraitDemo.destroy();
    revealInput.destroy();
    image.removeEventListener("load", portraitDemo.refresh);
    if (frame) window.cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    deleteMaskTarget(maskTargets[0]);
    deleteMaskTarget(maskTargets[1]);
    gl.deleteTexture(revealTexture);
    gl.deleteBuffer(quadBuffer);
    gl.deleteProgram(maskProgram);
    gl.deleteProgram(revealProgram);
  });

  return true;
}

// The reveal is never visible on touch devices; do not allocate either canvas
// renderer there, since even a hidden WebGL context consumes GPU resources.
let revealRenderersInitialized = false;
function initRevealRenderers() {
  if (!maskReveal || !maskRevealCanvas || !maskRevealImage || revealRenderersInitialized) return;
  revealRenderersInitialized = true;
  maskRevealImage.src = maskRevealImage.dataset.src;
  initWebGLMaskReveal(maskReveal, maskRevealCanvas, maskRevealImage);

  const revealContext = maskRevealCanvas.getContext("2d", { alpha: true });
  const revealMaskCanvas = document.createElement("canvas");
  const revealMaskContext = revealMaskCanvas.getContext("2d", { alpha: true });

  if (revealContext && revealMaskContext) {
    const revealInteractionSurface = maskReveal.closest(".hero") || maskReveal;
    const trailPoints = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));
    let revealWidth = 0;
    let revealHeight = 0;
    let revealImageX = 0;
    let revealImageY = 0;
    let revealImageWidth = 0;
    let revealImageHeight = 0;
    let revealFrame = 0;
    let revealVisible = true;
    let revealImageReady = maskRevealImage.complete && maskRevealImage.naturalWidth > 0;
    let revealPointerInside = false;
    let revealPointsPrimed = false;
    let revealTargetX = 0;
    let revealTargetY = 0;
    let revealCurrentX = 0;
    let revealCurrentY = 0;
    let revealPreviousX = 0;
    let revealPreviousY = 0;
    let revealOpacity = 0;
    let revealTargetOpacity = 0;
    let revealRadius = 0;
    let revealTargetRadius = 0;
    let portraitDemo;

    function clearReveal() {
      revealContext.clearRect(0, 0, revealWidth, revealHeight);
    }

    function resizeReveal() {
      const rect = maskRevealCanvas.getBoundingClientRect();
      const imageRect = maskReveal.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      revealWidth = nextWidth;
      revealHeight = nextHeight;
      revealImageX = imageRect.left - rect.left;
      revealImageY = imageRect.top - rect.top;
      revealImageWidth = imageRect.width;
      revealImageHeight = imageRect.height;
      maskRevealCanvas.width = Math.round(nextWidth * pixelRatio);
      maskRevealCanvas.height = Math.round(nextHeight * pixelRatio);
      revealMaskCanvas.width = maskRevealCanvas.width;
      revealMaskCanvas.height = maskRevealCanvas.height;
      revealContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      revealMaskContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      clearReveal();
    }

    function primeRevealPoints(x, y) {
      revealCurrentX = x;
      revealCurrentY = y;
      revealPreviousX = x;
      revealPreviousY = y;
      trailPoints.forEach((point) => {
        point.x = x;
        point.y = y;
      });
      revealPointsPrimed = true;
    }

    function setRevealPointer(event) {
      const rect = maskRevealCanvas.getBoundingClientRect();
      revealTargetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      revealTargetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      if (!revealPointsPrimed) primeRevealPoints(revealTargetX, revealTargetY);
    }

    function drawMaskSpot(x, y, radius, alpha) {
      if (radius <= 0.5 || alpha <= 0.002) return;
      const gradient = revealMaskContext.createRadialGradient(x, y, radius * 0.12, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.58, `rgba(255,255,255,${alpha * .94})`);
      gradient.addColorStop(0.82, `rgba(255,255,255,${alpha * .42})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      revealMaskContext.fillStyle = gradient;
      revealMaskContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function renderReveal() {
      revealFrame = 0;

      if (!revealVisible || !revealImageReady || revealReducedMotion.matches || !revealViewport.matches) {
        clearReveal();
        return;
      }

      revealCurrentX += (revealTargetX - revealCurrentX) * .16;
      revealCurrentY += (revealTargetY - revealCurrentY) * .16;
      revealOpacity += (revealTargetOpacity - revealOpacity) * .15;
      revealRadius += (revealTargetRadius - revealRadius) * .16;

      const velocityX = revealCurrentX - revealPreviousX;
      const velocityY = revealCurrentY - revealPreviousY;
      const velocity = Math.hypot(velocityX, velocityY);
      revealPreviousX = revealCurrentX;
      revealPreviousY = revealCurrentY;

      trailPoints[0].x += (revealCurrentX - trailPoints[0].x) * .58;
      trailPoints[0].y += (revealCurrentY - trailPoints[0].y) * .58;
      for (let index = 1; index < trailPoints.length; index += 1) {
        trailPoints[index].x += (trailPoints[index - 1].x - trailPoints[index].x) * .34;
        trailPoints[index].y += (trailPoints[index - 1].y - trailPoints[index].y) * .34;
      }

      revealMaskContext.clearRect(0, 0, revealWidth, revealHeight);
      for (let index = trailPoints.length - 1; index >= 0; index -= 1) {
        const trailProgress = 1 - index / trailPoints.length;
        drawMaskSpot(
          trailPoints[index].x,
          trailPoints[index].y,
          revealRadius * (.55 + trailProgress * .18),
          revealOpacity * (.035 + trailProgress * .065),
        );
      }

      const deformation = Math.min(revealRadius * .24, velocity * 3.2);
      const inverseVelocity = velocity > .01 ? 1 / velocity : 0;
      const perpendicularX = -velocityY * inverseVelocity * deformation;
      const perpendicularY = velocityX * inverseVelocity * deformation;
      drawMaskSpot(revealCurrentX, revealCurrentY, revealRadius, revealOpacity);
      drawMaskSpot(revealCurrentX + perpendicularX, revealCurrentY + perpendicularY, revealRadius * .78, revealOpacity * .74);
      drawMaskSpot(revealCurrentX - perpendicularX * .72, revealCurrentY - perpendicularY * .72, revealRadius * .72, revealOpacity * .62);

      revealContext.clearRect(0, 0, revealWidth, revealHeight);
      revealContext.globalCompositeOperation = "source-over";
      revealContext.drawImage(maskRevealImage, revealImageX, revealImageY, revealImageWidth, revealImageHeight);
      revealContext.globalCompositeOperation = "destination-in";
      revealContext.drawImage(revealMaskCanvas, 0, 0, revealWidth, revealHeight);
      revealContext.globalCompositeOperation = "source-over";


      const tail = trailPoints[trailPoints.length - 1];
      const isSettling = Math.abs(revealTargetX - revealCurrentX) > .08
        || Math.abs(revealTargetY - revealCurrentY) > .08
        || Math.abs(revealTargetOpacity - revealOpacity) > .006
        || Math.abs(revealTargetRadius - revealRadius) > .08
        || Math.abs(revealCurrentX - tail.x) > .12
        || Math.abs(revealCurrentY - tail.y) > .12;

      if (isSettling) revealFrame = window.requestAnimationFrame(renderReveal);
      else if (!revealPointerInside && revealOpacity < .01) clearReveal();
    }

    function queueReveal() {
      if (!revealFrame && revealVisible && revealImageReady) {
        revealFrame = window.requestAnimationFrame(renderReveal);
      }
    }

    function showReveal(event) {
      if (revealReducedMotion.matches || !revealViewport.matches) return;
      const rect = maskReveal.getBoundingClientRect();
      const isInside = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      if (!isInside) {
        if (revealPointerInside) hideReveal();
        return;
      }
      portraitDemo?.manual();
      setRevealPointer(event);
      revealPointerInside = true;
      revealTargetOpacity = 1;
      revealTargetRadius = Math.min(revealImageWidth, revealImageHeight) * .22;
      queueReveal();
    }

    function hideReveal() {
      if (portraitDemo?.running) return;
      revealPointerInside = false;
      revealTargetOpacity = 0;
      revealTargetRadius = 0;
      queueReveal();
    }

    function handleRevealPreference() {
      if (revealReducedMotion.matches || !revealViewport.matches) {
        revealInput.reset();
        hideReveal();
        clearReveal();
      }
    }

    const revealInput = HeroRevealInput.bind({
      surface: revealInteractionSurface, target: maskReveal,
      enabled: () => revealViewport.matches && !revealReducedMotion.matches,
      hover: () => revealHoverPointer.matches, move: showReveal, end: hideReveal,
    });
    revealReducedMotion.addEventListener("change", handleRevealPreference);
    revealViewport.addEventListener("change", handleRevealPreference);

    maskRevealImage.addEventListener("load", () => {
      revealImageReady = true;
      queueReveal();
    }, { once: true });

    const revealResizeObserver = new ResizeObserver(() => {
      resizeReveal();
      if (revealPointerInside) {
        revealTargetRadius = Math.min(revealImageWidth, revealImageHeight) * .22;
        queueReveal();
      }
    });
    revealResizeObserver.observe(maskReveal);

    const revealVisibilityObserver = new IntersectionObserver(([entry]) => {
      revealVisible = entry.isIntersecting;
      if (!revealVisible) {
        if (revealFrame) window.cancelAnimationFrame(revealFrame);
        revealFrame = 0;
        clearReveal();
      } else if (revealPointerInside) {
        queueReveal();
      }
    });
    revealVisibilityObserver.observe(maskReveal);

    resizeReveal();
    portraitDemo = mountPortraitDemo(maskReveal, {
      ready: () => revealImageReady,
      move(state) {
        const rect = maskReveal.getBoundingClientRect();
        setRevealPointer({ clientX: rect.left + state.x * rect.width, clientY: rect.top + state.y * rect.height });
        revealTargetOpacity = Math.min(1, state.radius / .25);
        revealTargetRadius = Math.min(revealImageWidth, revealImageHeight) * .22 * state.radius;
        queueReveal();
      },
      stop(reason) {
        if (reason === "manual") return;
        if (revealFrame) window.cancelAnimationFrame(revealFrame);
        revealFrame = 0;
        revealTargetOpacity = revealOpacity = revealTargetRadius = revealRadius = 0;
        clearReveal();
      },
    });
    maskRevealImage.addEventListener("load", portraitDemo.refresh, { once: true });

    HeroRevealInput.cleanupOnPageDiscard(window, () => {
      portraitDemo.destroy();
      revealInput.destroy();
      maskRevealImage.removeEventListener("load", portraitDemo.refresh);
      if (revealFrame) window.cancelAnimationFrame(revealFrame);
      revealResizeObserver.disconnect();
      revealVisibilityObserver.disconnect();
    });
  }
}
if (revealViewport.matches) initRevealRenderers();
revealViewport.addEventListener("change", () => {
  if (revealViewport.matches) initRevealRenderers();
});

const magneticPointer = window.matchMedia("(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
const magneticButtons = [...document.querySelectorAll(".actions .button")];
const buttonRects = new Map();
const pointer = { x: -1000, y: -1000 };
let animationFrame = 0;

function resetButton(button) {
  button.classList.remove("is-magnetic");
  button.style.setProperty("--magnet-x", "0px");
  button.style.setProperty("--magnet-y", "0px");
}

function resetMagnet() {
  magneticButtons.forEach(resetButton);
}

function measureButtons() {
  // Avoid invalidating style immediately before reading layout on initial load.
  if (magneticButtons.some((button) => button.classList.contains("is-magnetic"))) resetMagnet();
  magneticButtons.forEach((button) => {
    const rect = button.getBoundingClientRect();
    buttonRects.set(button, {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    });
  });
}

function renderMagnet() {
  animationFrame = 0;

  if (!magneticPointer.matches) {
    resetMagnet();
    return;
  }

  const candidates = magneticButtons.map((button) => {
    const rect = buttonRects.get(button);
    if (!rect) return null;

    const centerX = rect.left - window.scrollX + rect.width / 2;
    const centerY = rect.top - window.scrollY + rect.height / 2;
    const deltaX = pointer.x - centerX;
    const deltaY = pointer.y - centerY;
    const edgeDistance = Math.hypot(
      Math.max(Math.abs(deltaX) - rect.width / 2, 0),
      Math.max(Math.abs(deltaY) - rect.height / 2, 0),
    );
    return { button, deltaX, deltaY, edgeDistance };
  }).filter(Boolean);

  const target = candidates.reduce((nearest, candidate) => (
    !nearest || candidate.edgeDistance < nearest.edgeDistance ? candidate : nearest
  ), null);
  const activationDistance = 88;

  magneticButtons.forEach((button) => {
    if (!target || target.button !== button || target.edgeDistance > activationDistance) {
      resetButton(button);
      return;
    }

    const strength = (1 - target.edgeDistance / activationDistance) * 0.16;
    const offsetX = Math.max(-14, Math.min(14, target.deltaX * strength));
    const offsetY = Math.max(-10, Math.min(10, target.deltaY * strength));

    button.classList.add("is-magnetic");
    button.style.setProperty("--magnet-x", `${offsetX.toFixed(2)}px`);
    button.style.setProperty("--magnet-y", `${offsetY.toFixed(2)}px`);
  });
}

function queueMagnetRender() {
  if (!animationFrame) animationFrame = window.requestAnimationFrame(renderMagnet);
}

window.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  queueMagnetRender();
}, { passive: true });

window.addEventListener("resize", measureButtons, { passive: true });
document.documentElement.addEventListener("mouseleave", resetMagnet);
magneticPointer.addEventListener("change", measureButtons);

measureButtons();

const primaryActions = document.querySelector(".actions");
const contactIsland = document.querySelector(".contact-island");
const closingContact = document.querySelector(".contact");

function setContactIslandVisibility(isVisible) {
  if (!contactIsland) return;
  contactIsland.classList.toggle("is-visible", isVisible);
  contactIsland.setAttribute("aria-hidden", String(!isVisible));
}

if (primaryActions && contactIsland && closingContact) {
  if ("IntersectionObserver" in window) {
    let actionsHavePassed = primaryActions.getBoundingClientRect().bottom <= 0;
    let closingContactHasArrived = closingContact.getBoundingClientRect().top < window.innerHeight;

    const updateContactIslandVisibility = () => {
      setContactIslandVisibility(actionsHavePassed && !closingContactHasArrived);
    };

    const contactIslandObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === primaryActions) {
          actionsHavePassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        } else if (entry.target === closingContact) {
          closingContactHasArrived = entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight;
        }
      });

      updateContactIslandVisibility();
    });

    contactIslandObserver.observe(primaryActions);
    contactIslandObserver.observe(closingContact);
    updateContactIslandVisibility();
  } else {
    let contactIslandFrame = 0;
    const updateContactIsland = () => {
      contactIslandFrame = 0;
      const actionsHavePassed = primaryActions.getBoundingClientRect().bottom <= 0;
      const closingContactHasArrived = closingContact.getBoundingClientRect().top < window.innerHeight;
      setContactIslandVisibility(actionsHavePassed && !closingContactHasArrived);
    };
    const queueContactIslandUpdate = () => {
      if (!contactIslandFrame) contactIslandFrame = requestAnimationFrame(updateContactIsland);
    };

    window.addEventListener("scroll", queueContactIslandUpdate, { passive: true });
    window.addEventListener("resize", queueContactIslandUpdate, { passive: true });
    updateContactIsland();
  }
}

const softBlurTitles = [...document.querySelectorAll("[data-soft-blur-in]")];
ProjectMediaPress.bind('.vibecoded-card .project-media');
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const reactionStickers = [...document.querySelectorAll(".sticker[data-reaction-pool]")];
const reactionCollage = document.querySelector(".collage");
const stickerFeedback = {
  success: { particles: 11 },
  buzz: { particles: 23 },
  error: { particles: 8 },
  nudge: { particles: 8 },
};
let haptics;
let stickerHaptics;

if (window.location.protocol !== "file:") {
  import("./public/lib/sticker-feedback.mjs?v=20260918-2").then((hapticsModule) => {
    haptics = new hapticsModule.WebHaptics();
    stickerHaptics = hapticsModule.createStickerFeedback();
  }).catch(() => undefined);
}

function triggerHapticFeedback(pattern = "buzz") {
  if (haptics && typeof navigator.vibrate === "function") {
    void haptics.trigger(pattern, { intensity: .72 });
  }
}

document.addEventListener("portfolio:career-step-complete", () => triggerHapticFeedback());

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function animateStickerBuzz(sticker) {
  if (reducedMotion.matches) return;

  const glyph = sticker.querySelector(".sticker-glyph");
  if (!glyph?.animate) return;

  const isMobile = window.innerWidth < 600;
  const distance = isMobile ? 10 : 16;
  const lift = isMobile ? 6 : 10;
  const tilt = isMobile ? 8 : 11;
  const peakScale = isMobile ? 1.12 : 1.16;

  return glyph.animate([
    { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)" },
    { transform: `translate3d(${-distance}px, ${lift * .5}px, 0) rotate(${-tilt}deg) scale(${peakScale - .04})` },
    { transform: `translate3d(${distance}px, ${-lift}px, 0) rotate(${tilt}deg) scale(${peakScale})` },
    { transform: `translate3d(${-distance * .85}px, ${-lift * .65}px, 0) rotate(${-tilt * .85}deg) scale(${peakScale - .02})` },
    { transform: `translate3d(${distance * .8}px, ${lift * .55}px, 0) rotate(${tilt * .72}deg) scale(${peakScale - .03})` },
    { transform: `translate3d(${-distance * .5}px, ${lift * .2}px, 0) rotate(${-tilt * .45}deg) scale(${peakScale - .07})` },
    { transform: `translate3d(${distance * .28}px, ${-lift * .12}px, 0) rotate(${tilt * .25}deg) scale(${peakScale - .1})` },
    { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)" },
  ], {
    duration: 560,
    easing: "linear",
  });
}

function emitEmojiReactions(sticker, particleCount) {
  if (!reactionCollage || reducedMotion.matches) return [];

  const pool = sticker.dataset.reactionPool.split(",");
  const stickerRect = sticker.getBoundingClientRect();
  const collageRect = reactionCollage.getBoundingClientRect();
  const isMobile = window.innerWidth < 600;
  const count = particleCount ?? (5 + Math.floor(Math.random() * 4));
  const particles = [];
  const startX = stickerRect.left - collageRect.left + stickerRect.width / 2;
  const startY = stickerRect.top - collageRect.top + stickerRect.height / 2;

  for (let index = 0; index < count; index += 1) {
    const reaction = document.createElement("span");
    const horizontalSpread = isMobile ? 58 : 112;
    const riseMin = isMobile ? 48 : 82;
    const riseMax = isMobile ? 108 : 172;
    const duration = Math.round(randomBetween(540, 760));

    reaction.className = "emoji-reaction";
    reaction.setAttribute("aria-hidden", "true");
    reaction.textContent = pool[Math.floor(Math.random() * pool.length)];
    reaction.style.left = `${startX}px`;
    reaction.style.top = `${startY}px`;
    reaction.style.setProperty("--reaction-x", `${randomBetween(-horizontalSpread, horizontalSpread).toFixed(1)}px`);
    reaction.style.setProperty("--reaction-y", `${(-randomBetween(riseMin, riseMax)).toFixed(1)}px`);
    reaction.style.setProperty("--reaction-rotate", `${randomBetween(-24, 24).toFixed(1)}deg`);
    reaction.style.setProperty("--reaction-scale", randomBetween(.72, 1.08).toFixed(2));
    reaction.style.setProperty("--reaction-size", `${Math.round(randomBetween(isMobile ? 26 : 32, isMobile ? 35 : 44))}px`);
    reaction.style.setProperty("--reaction-duration", `${duration}ms`);
    reaction.style.setProperty("--reaction-delay", `${Math.round(index * randomBetween(8, 18))}ms`);
    reaction.addEventListener("animationend", () => reaction.remove(), { once: true });
    reactionCollage.append(reaction);
    particles.push(reaction);
  }
  return particles;
}

function playStickerReaction(sticker, particleCount) {
  const buzz = animateStickerBuzz(sticker);
  const particles = emitEmojiReactions(sticker, particleCount);
  return () => { buzz?.cancel(); particles.forEach(particle => particle.remove()); };
}

function demoStickerPair() {
  const visible = reactionStickers.map(sticker => ({ sticker, rect: sticker.getBoundingClientRect() }))
    .filter(({ rect: r }) => {
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      // Keep the demonstration above the existing fixed contact island.
      return x >= 0 && x <= window.innerWidth && y >= 24 && y <= window.innerHeight - 96;
    });
  let pair = [];
  let distance = 0;
  visible.forEach((a, i) => visible.slice(i + 1).forEach(b => {
    const separation = Math.hypot(a.rect.left - b.rect.left, a.rect.top - b.rect.top);
    if (separation > distance) { distance = separation; pair = [a.sticker, b.sticker]; }
  }));
  return pair;
}

let demoPair = [];
let nextDemoSticker = 0;
let cancelDemoReactions = [];
const emojiDemo = InteractionDemos.mount({
  target: reactionCollage, key: "portfolio:emoji-reactions-demo:seen",
  delay: 400, duration: 1800, threshold: .58, settleOnScroll: true, persistOnStart: true,
  ready: () => demoStickerPair().length === 2,
  onStart() { demoPair = demoStickerPair(); nextDemoSticker = 0; },
  onFrame(ms) {
    if (nextDemoSticker < 2 && ms >= nextDemoSticker * 400) {
      const sticker = demoPair[nextDemoSticker++];
      const effect = stickerFeedback[sticker.dataset.hapticPattern];
      if (effect) cancelDemoReactions.push(playStickerReaction(sticker, effect.particles));
    }
  },
  onStop() { cancelDemoReactions.forEach(cancel => cancel()); cancelDemoReactions = []; demoPair = []; },
});

reactionStickers.forEach((sticker) => {
  const hapticSwitch = sticker.querySelector(".sticker-haptic-switch");
  hapticSwitch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat) return;
    event.preventDefault();
    hapticSwitch.click();
  });
  sticker.addEventListener("click", () => {
    emojiDemo.manual();
    const effect = stickerFeedback[sticker.dataset.hapticPattern];
    if (!effect) return;
    playStickerReaction(sticker, effect.particles);
    if (stickerHaptics) {
      stickerHaptics.trigger(sticker.dataset.hapticPattern, { muted: reducedMotion.matches });
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") stickerHaptics?.cancel();
});
window.addEventListener("pagehide", () => stickerHaptics?.cancel());

function prepareSoftBlurTitle(title) {
  const originalText = title.textContent;
  const content = document.createElement("span");
  const characters = [];
  let characterIndex = 0;

  content.className = "soft-blur-content";
  content.setAttribute("aria-hidden", "true");
  title.setAttribute("aria-label", originalText);

  originalText.split(/( +)/).forEach((token) => {
    if (/^ +$/.test(token)) {
      content.append(document.createTextNode(token));
      characterIndex += Array.from(token).length;
      return;
    }

    const word = document.createElement("span");
    word.className = "soft-blur-word";

    Array.from(token).forEach((character) => {
      const unit = document.createElement("span");
      unit.className = "soft-blur-char";
      unit.textContent = character;
      unit.dataset.softBlurRank = String(characterIndex);
      unit.style.opacity = "0";
      unit.style.transform = "translate3d(0, 9.28px, 0)";
      unit.style.filter = `blur(${window.innerWidth < 600 ? 6 : 12}px)`;
      word.append(unit);
      characters.push(unit);
      characterIndex += 1;
    });

    content.append(word);
  });

  title.replaceChildren(content);
  return characters;
}

function revealSoftBlurTitle(title, characters) {
  const initialDelay = Math.round(Math.random() * 400);
  const stagger = window.innerWidth < 600 ? 15 : 18;
  const blur = window.innerWidth < 600 ? 6 : 12;

  const animations = characters.map((character) => character.animate([
    {
      opacity: 0,
      transform: "translate3d(0, 9.28px, 0)",
      filter: `blur(${blur}px)`,
    },
    {
      opacity: 1,
      transform: "translate3d(0, 0, 0)",
      filter: "blur(0px)",
    },
  ], {
    delay: initialDelay + Number(character.dataset.softBlurRank) * stagger,
    duration: 648,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "forwards",
  }));

  Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    characters.forEach((character, index) => {
      character.style.opacity = "1";
      character.style.transform = "translate3d(0, 0, 0)";
      character.style.filter = "blur(0px)";
      animations[index].cancel();
    });
    title.classList.add("soft-blur-complete");
  });
}

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const preparedTitles = new Map(softBlurTitles.map((title) => [title, prepareSoftBlurTitle(title)]));
  const softBlurObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      revealSoftBlurTitle(entry.target, preparedTitles.get(entry.target));
    });
  }, { threshold: 0.35, rootMargin: "0px 0px -10%" });

  softBlurTitles.forEach((title) => softBlurObserver.observe(title));
}

const counterNumbers = [...document.querySelectorAll(".counter-number[data-counter-target]")];
const counterSection = document.querySelector("#experience .jobs");
let counterRun = 0;
let countersHaveRun = false;

function animateCounter(number, index, run) {
  const target = Number(number.dataset.counterTarget);
  const start = 2000;
  const duration = 1100;
  const delay = index * 70;
  let startedAt;

  function renderCounter(timestamp) {
    if (run !== counterRun) return;
    if (startedAt === undefined) startedAt = timestamp + delay;
    const elapsed = timestamp - startedAt;

    if (elapsed < 0) {
      window.requestAnimationFrame(renderCounter);
      return;
    }

    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    number.textContent = String(Math.round(start + (target - start) * easedProgress));

    if (progress < 1) window.requestAnimationFrame(renderCounter);
    else number.textContent = String(target);
  }

  window.requestAnimationFrame(renderCounter);
}

function startCounters() {
  if (countersHaveRun) return;
  countersHaveRun = true;
  counterRun += 1;
  const run = counterRun;
  counterNumbers.forEach((number) => { number.textContent = "2000"; });
  counterNumbers.forEach((number, index) => animateCounter(number, index, run));
}

if (counterSection && counterNumbers.length && !reducedMotion.matches) {
  if ("IntersectionObserver" in window) {
    const counterObserver = new IntersectionObserver(([entry], observer) => {
      if (!entry.isIntersecting) return;
      startCounters();
      observer.unobserve(entry.target);
    }, { threshold: 0.25, rootMargin: "0px 0px -12%" });

    counterObserver.observe(counterSection);
  } else {
    startCounters();
  }
}

const parallaxCollage = document.querySelector(".collage");
if (parallaxCollage) {
  const lifeSection = document.querySelector(".about") || parallaxCollage;
  const lifeGlowLoads = new Map();
  let lifeGlowFrame = 0;
  let lifeGlowVariant = null;
  let lifeGlowRequest = 0;
  let lifeGlowActivated = false;
  let lifeGlowObserver = null;
  const positionLifeGlow = () => {
    lifeGlowFrame = 0;
    const rect = parallaxCollage.getBoundingClientRect();
    document.body.style.setProperty("--life-glow-center-y", `${rect.top + window.scrollY + rect.height / 2}px`);
  };
  const queueLifeGlowPosition = () => {
    if (!lifeGlowFrame) lifeGlowFrame = window.requestAnimationFrame(positionLifeGlow);
  };
  const loadLifeGlow = (src) => {
    if (lifeGlowLoads.has(src)) return lifeGlowLoads.get(src);
    const loaded = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.onload = async () => {
        if (image.decode) {
          try { await image.decode(); } catch { /* A loaded image can still be displayed. */ }
        }
        resolve(image.naturalWidth > 0);
      };
      image.onerror = () => resolve(false);
      image.src = src;
    }).then((ready) => {
      if (!ready) lifeGlowLoads.delete(src);
      return ready;
    });
    lifeGlowLoads.set(src, loaded);
    return loaded;
  };
  const prepareLifeGlow = async () => {
    if (!lifeGlowActivated) return;
    const variant = window.matchMedia("(max-width: 600px)").matches ? "mobile" :
      window.matchMedia("(max-width: 1199px)").matches ? "tablet" : "desktop";
    const highDensity = variant !== "mobile" && window.devicePixelRatio >= 1.5;
    const variantKey = `${variant}${highDensity ? "@2x" : ""}`;
    if (variantKey === lifeGlowVariant) return;
    lifeGlowVariant = variantKey;
    const request = ++lifeGlowRequest;
    document.body.classList.remove("life-glow-ready", "life-glow-hd");
    if (variant === "mobile") return;

    const asset = `public/assets/life/life-glow-${variant}`;
    const version = "?v=20260925-2";
    let useHighDensity = highDensity;
    let ready = await loadLifeGlow(`${asset}${useHighDensity ? "@2x" : ""}.webp${version}`);
    if (!ready && useHighDensity) {
      useHighDensity = false;
      ready = await loadLifeGlow(`${asset}.webp${version}`);
    }
    if (request !== lifeGlowRequest) return;
    if (!ready) {
      lifeGlowVariant = null;
      return;
    }
    if (useHighDensity) document.body.classList.add("life-glow-hd");
    document.body.classList.add("life-glow-ready");
  };
  const activateLifeGlow = () => {
    if (lifeGlowActivated) return;
    lifeGlowActivated = true;
    lifeGlowObserver?.disconnect();
    lifeGlowObserver = null;
    window.removeEventListener("scroll", checkLifeGlowDistance);
    prepareLifeGlow();
  };
  const checkLifeGlowDistance = () => {
    const rect = lifeSection.getBoundingClientRect();
    const margin = window.innerHeight * 1.5;
    if (rect.top <= window.innerHeight + margin && rect.bottom >= -margin) activateLifeGlow();
  };
  const observeLifeGlow = () => {
    if (lifeGlowActivated) return;
    lifeGlowObserver?.disconnect();
    if ("IntersectionObserver" in window) {
      lifeGlowObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) activateLifeGlow();
      }, { rootMargin: `${Math.ceil(window.innerHeight * 1.5)}px 0px` });
      lifeGlowObserver.observe(lifeSection);
    } else {
      window.addEventListener("scroll", checkLifeGlowDistance, { passive: true });
      checkLifeGlowDistance();
    }
  };

  positionLifeGlow();
  observeLifeGlow();
  window.addEventListener("resize", () => {
    queueLifeGlowPosition();
    if (lifeGlowActivated) prepareLifeGlow();
    else observeLifeGlow();
  }, { passive: true });
  window.addEventListener("load", queueLifeGlowPosition, { once: true });
  window.addEventListener("pageshow", () => {
    queueLifeGlowPosition();
    if (lifeGlowActivated) prepareLifeGlow();
    else observeLifeGlow();
  });
  document.fonts?.ready.then(queueLifeGlowPosition);
  if ("ResizeObserver" in window) {
    new ResizeObserver(queueLifeGlowPosition).observe(document.querySelector(".page"));
  }
}
const parallaxItems = [...document.querySelectorAll("[data-parallax-speed]")];
let parallaxActive = false;
let parallaxFrame = 0;

function resetParallax() {
  parallaxItems.forEach((item) => item.style.setProperty("--parallax-y", "0px"));
}

function renderParallax() {
  parallaxFrame = 0;

  if (!parallaxCollage || !parallaxActive || reducedMotion.matches) {
    if (reducedMotion.matches) resetParallax();
    return;
  }

  const rect = parallaxCollage.getBoundingClientRect();
  const travel = window.innerHeight / 2 + rect.height / 2;
  const progress = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (rect.top + rect.height / 2)) / travel));
  const responsiveFactor = window.innerWidth < 600 ? 0.9 : 1.75;

  parallaxItems.forEach((item) => {
    const speed = Number(item.dataset.parallaxSpeed);
    const offset = progress * speed * responsiveFactor;
    item.style.setProperty("--parallax-y", `${offset.toFixed(2)}px`);
  });
}

function queueParallaxRender() {
  if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(renderParallax);
}

if (parallaxCollage && parallaxItems.length) {
  if ("IntersectionObserver" in window) {
    const parallaxObserver = new IntersectionObserver(([entry]) => {
      parallaxActive = entry.isIntersecting;
      parallaxCollage.classList.toggle("is-parallax-active", parallaxActive && !reducedMotion.matches);
      if (parallaxActive) queueParallaxRender();
    }, { rootMargin: "25% 0px" });

    parallaxObserver.observe(parallaxCollage);
  } else {
    parallaxActive = true;
    parallaxCollage.classList.add("is-parallax-active");
  }

  window.addEventListener("scroll", queueParallaxRender, { passive: true });
  window.addEventListener("resize", queueParallaxRender, { passive: true });
  reducedMotion.addEventListener("change", () => {
    parallaxCollage.classList.toggle("is-parallax-active", parallaxActive && !reducedMotion.matches);
    if (reducedMotion.matches) resetParallax();
    else queueParallaxRender();
  });
}
