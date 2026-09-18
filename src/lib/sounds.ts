let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur);
}
export const playClick = () => tone(1200, 0, 0.05, "square", 0.04); // soft mechanical key click
export const playCorrect = () => {
  playClick();
  tone(880, 0.05, 0.12, "triangle", 0.12);
}; // muted blip per correct attempt
export const playError = () => tone(160, 0, 0.18, "sawtooth", 0.08);
export const playClimax = () => {
  // little victory run
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle", 0.14));
};
