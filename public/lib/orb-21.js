/*
 * Orb-21 WebGL port of shadercn's TypeGPU shader (commit 7569572).
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 * Source: https://github.com/shadcn-labs/shadercn/tree/main/registry/components/orbs/orb-21
 * This port retains the volume integral, 56 view / 4 light steps, density field,
 * thinking palette/preset and synthesized drive. No React/TypeGPU dependency.
 */
const vertex = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const fragment = `precision highp float;
uniform vec2 res;
uniform float phase;
uniform float inputVol;
uniform float outputVol;
uniform vec3 lightColor;
uniform vec3 shadowColor;
float density(vec3 p, float nimbusDensity) {
  float shell = 1.0 - length(p) / 2.0;
  if (shell <= 0.0) return 0.0;
  vec3 q = p * 0.8;
  float f = 1.0;
  for (int k = 0; k < 4; k++) {
    q += cos(q.yzx * f + phase * 0.3) / f;
    f *= 1.8;
  }
  float n = ((sin(q.x) + sin(q.y) + sin(q.z)) / 3.0) * 0.5 + 0.5;
  return smoothstep(0.075, 1.0, n) * pow(shell, 0.8) * nimbusDensity;
}
void main() {
  // WebGPU's screen UV has its origin at the top left.
  vec2 uv = (vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) * 2.0 - res) / min(res.x, res.y);
  vec3 ro = vec3(0.0, 0.0, -4.4);
  vec3 rd = normalize(vec3(uv, 1.8));
  // Skip rays that miss the bounded cloud, before its expensive density loop.
  float b = dot(ro, rd);
  if (b * b - dot(ro, ro) + 4.0 < 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 L = normalize(vec3(cos(phase * 0.12) * 0.7, 0.45, sin(phase * 0.12) * 0.35 + 0.65));
  float hg = (1.0 - 0.45 * 0.45) / pow(max(1.0 + 0.45 * 0.45 - 2.0 * 0.45 * dot(rd, L), 0.0001), 1.5);
  float nimbusDensity = 3.2 * (1.0 + 0.35 * inputVol);
  float power = 2.15 * (0.7 + 0.9 * outputVol);
  float dt = 4.0 / 56.0;
  float T = 1.0;
  vec3 scattered = vec3(0.0);
  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * (2.4 + (float(i) + 0.5) * dt);
    float dn = density(p, nimbusDensity);
    if (dn > 0.001) {
      float shadow = 1.0;
      for (int k = 0; k < 4; k++) {
        vec3 lp = p + L * ((float(k) + 0.5) * 0.5);
        shadow *= exp(-density(lp, nimbusDensity) * 0.5 * 2.4);
      }
      vec3 lit = mix(shadowColor * 0.65, lightColor, shadow);
      scattered += lit * (T * dn * dt * hg * power);
      T *= exp(-dn * dt * 1.4);
      if (T < 0.01) break;
    }
  }
  float body = 1.0 - T;
  scattered += shadowColor * (body * 0.22);
  // Stable tanh equivalent for GLSL ES 1.00.
  vec3 e = exp(-2.0 * scattered);
  vec3 color = (1.0 - e) / (1.0 + e);
  gl_FragColor = vec4(color, clamp(body * 1.5, 0.0, 1.0));
}`;

export function mountThinkingOrb(container, colors) {
  const canvas = container.querySelector('canvas');
  let gl;
  let program;
  let buffer;
  const shaders = [];
  let raf = 0;
  let dead = false;
  let observer;
  let seconds = 0;
  let phase = 12;
  let last = 0;
  let input = 0.38;
  let output = 0.48 + 0.12 * Math.sin(0.6);
  let speed = 0.1 + (1 - (output - 1) ** 2) * 0.9;
  let speedVelocity = 0;
  let painted = false;
  let visible = true;
  let uniforms;

  function cleanup() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', lost);
    container.classList.remove('is-rendered');
    if (gl) {
      gl.useProgram(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
      // Let the browser retire the context; explicit loss would make this same
      // canvas unusable on BFCache return or when reduced motion changes back.
      gl.flush();
      canvas.width = canvas.height = 1;
    }
  }
  function lost(event) { event.preventDefault(); cleanup(); }
  function resize() {
    if (dead) return;
    // At most 270² pixels: enough for the small, soft cloud on retina screens.
    const size = Math.max(1, Math.round(container.clientWidth * Math.min(devicePixelRatio || 1, 1.5)));
    canvas.width = canvas.height = size;
    gl.viewport(0, 0, size, size);
    gl.uniform2f(uniforms.res, size, size);
  }
  function schedule() {
    cancelAnimationFrame(raf);
    last = 0;
    if (!dead && !document.hidden && visible) raf = requestAnimationFrame(frame);
  }
  function visibility() { schedule(); }
  function frame(now) {
    if (dead || document.hidden || !visible) return;
    // A 30 fps budget avoids rendering 60/120 expensive frames per second.
    if (last && now - last < 1000 / 30 - 1) { raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    seconds += dt;
    const ease = 1 - Math.exp(-dt * 12);
    const targetInput = 0.38 + 0.07 * Math.sin(seconds * 0.7) + 0.05 * Math.sin(seconds * 2.1) * Math.sin(seconds * 0.37 + 1.2);
    const targetOutput = 0.48 + 0.12 * Math.sin(seconds * 1.05 + 0.6);
    input += (targetInput - input) * ease;
    output += (targetOutput - output) * ease;
    const targetSpeed = 0.1 + (1 - (output - 1) ** 2) * 0.9;
    const f = 1 + 8 * dt;
    const hoo = dt * 16;
    const inv = 1 / (f + dt * hoo);
    const next = (f * speed + dt * speedVelocity + dt * hoo * targetSpeed) * inv;
    speedVelocity = (speedVelocity + hoo * (targetSpeed - speed)) * inv;
    speed = next;
    phase += dt * speed * 10;
    try {
      gl.uniform1f(uniforms.phase, phase);
      gl.uniform1f(uniforms.inputVol, input);
      gl.uniform1f(uniforms.outputVol, output);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!painted) {
        if (gl.getError() !== gl.NO_ERROR) { cleanup(); return; }
        painted = true;
        container.classList.add('is-rendered');
      }
      raf = requestAnimationFrame(frame);
    } catch { cleanup(); }
  }
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return cleanup;
    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    }
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['res', 'phase', 'inputVol', 'outputVol', 'lightColor', 'shadowColor'].map(key => [key, gl.getUniformLocation(program, key)]));
    const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    gl.uniform3fv(uniforms.lightColor, rgb(colors.light));
    gl.uniform3fv(uniforms.shadowColor, rgb(colors.shadow));
    resize();
    canvas.addEventListener('webglcontextlost', lost);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
      observer.observe(container);
    }
    schedule();
  } catch { cleanup(); }
  return cleanup;
}
