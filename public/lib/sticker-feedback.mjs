import { WebHaptics, defaultPatterns } from './web-haptics/index.mjs';

export { WebHaptics };

// Keep the original sound scores separate: debug audio used to share the
// vibration score, so changing vibration alone would also change the sound.
export const stickerScores = {
  success: {
    sound: defaultPatterns.success.pattern,
    haptic: [{ duration: 24, intensity: .4 }, { delay: 66, duration: 36, intensity: .6 }],
  },
  buzz: {
    sound: defaultPatterns.buzz.pattern,
    haptic: [
      { duration: 40, intensity: .55 },
      { delay: 40, duration: 30, intensity: .4 },
      { delay: 70, duration: 55, intensity: .65 },
      { delay: 85, duration: 55, intensity: .6 },
      { delay: 105, duration: 45, intensity: .45 },
      { delay: 135, duration: 60, intensity: .35 },
    ],
  },
  error: {
    sound: [
      { duration: 40, intensity: .7 },
      { delay: 40, duration: 40, intensity: .7 },
      { delay: 40, duration: 40, intensity: .9 },
      { delay: 40, duration: 50, intensity: .6 },
    ],
    haptic: [
      { duration: 18, intensity: .55 },
      { delay: 62, duration: 24, intensity: .65 },
      { delay: 56, duration: 38, intensity: .8 },
      { delay: 42, duration: 20, intensity: .4 },
    ],
  },
  nudge: {
    sound: defaultPatterns.nudge.pattern,
    haptic: [{ duration: 80, intensity: .45 }, { delay: 80, duration: 40, intensity: .3 }],
  },
};

export function createStickerFeedback({ Haptics = WebHaptics } = {}) {
  const tactile = new Haptics();
  const sound = new Haptics({ debug: true });
  // Reuse the installed library's exact noise synthesis and sound scheduler,
  // but never its switch clicks or navigator.vibrate for this audio-only voice.
  sound.hapticLabel = { click() {} };
  let revision = 0;

  async function playSound(pattern, expected) {
    try {
      await sound.ensureAudio();
      if (expected !== revision) return;
      sound.stopPattern();
      if (sound.audioCtx) sound.playClick(pattern[0].intensity);
      await sound.runPattern(pattern, .5, true);
    } catch { /* Audio unavailable: animation and tactile feedback are independent. */ }
  }

  function cancel() {
    revision++;
    try { tactile.cancel(); } catch { /* Unsupported device. */ }
    sound.stopPattern();
  }

  return {
    trigger(key, { muted = false } = {}) {
      const score = stickerScores[key];
      if (!score) return;
      cancel(); // A new interaction replaces, rather than stacks, an old rhythm.
      const expected = revision;
      // Safari keeps the native response to the user's actual sticker switch tap.
      // Do not synthesize extra switch clicks when Vibration API is unavailable.
      if (Haptics.isSupported) {
        try { Promise.resolve(tactile.trigger(score.haptic)).catch(() => {}); } catch { /* Unsupported device. */ }
      }
      if (!muted) void playSound(score.sound, expected);
    },
    cancel,
  };
}
