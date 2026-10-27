/**
 * The touchdown sound: three rising notes made in the browser (Web Audio), so there's no audio
 * file to download. Off unless switched on in Settings; browsers also only allow sound after
 * you've tapped something on the page, so it never blares on load.
 */
let context: AudioContext | null = null;
let lastPlayed = 0;

export function playTouchdownSound() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  // Several touchdowns arriving together play once.
  if (now - lastPlayed < 1500) return;
  lastPlayed = now;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    context ??= new Ctx();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.02;
    [523.25, 659.25, 783.99].forEach((frequency, i) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      const t = start + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 2 ? 0.5 : 0.18));
      osc.connect(gain).connect(context!.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    // No sound available: the animation still plays.
  }
}
