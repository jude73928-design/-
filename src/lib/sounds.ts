// High-end acoustic haptic sound synthesizer using Web Audio API.
// Creates addictive, tactile, muted sounds with zero latency and no external audio files.

export type SoundTheme =
  "onetick" | "woodchop" | "mutedtech" | "mutedtick" | "softpop" | "analogdial" | "mute";

export interface SoundThemeOption {
  id: SoundTheme;
  name: string;
  description: string;
  badge: string;
}

export const SOUND_THEMES: SoundThemeOption[] = [
  {
    id: "onetick",
    name: "One Move One Tick",
    description: "Single precision tactile micro-tick per move (1:1 feedback)",
    badge: "⏱️ 1 Move 1 Tick",
  },
  {
    id: "woodchop",
    name: "Wood Chop",
    description: "Hollow teak & organic bamboo chop",
    badge: "🪵 Warm Wood",
  },
  {
    id: "mutedtech",
    name: "Muted Tech",
    description: "Damped lubed mechanical switch click",
    badge: "⌨️ Crisp Tech",
  },
  {
    id: "mutedtick",
    name: "Muted Tick",
    description: "Precision micro-haptic tick",
    badge: "⏱️ Subtle Tick",
  },
  {
    id: "softpop",
    name: "Soft Pop",
    description: "Juicy rounded acoustic bubble pop",
    badge: "🫧 Soft Pop",
  },
  {
    id: "analogdial",
    name: "Analog Dial",
    description: "Camera shutter & rotary ratchet latch",
    badge: "📷 Analog Dial",
  },
  {
    id: "mute",
    name: "Mute",
    description: "Silent transitions without sound effects",
    badge: "🔇 Off",
  },
];

const THEME_STORAGE_KEY = "fc_transition_sound_theme_v2";

export function getSoundTheme(): SoundTheme {
  if (typeof window === "undefined") return "onetick";
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as SoundTheme | null;
  if (saved && SOUND_THEMES.some((t) => t.id === saved)) {
    return saved;
  }
  return "onetick";
}

export function setSoundTheme(theme: SoundTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("flashcards-sound-theme-changed", { detail: theme }));
}

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/**
 * 1. Wood Chop:
 * Organic, hollow bamboo / solid teak block strike.
 */
export function playWoodChop(pitch = 1, volume = 0.25) {
  try {
    const c = ac();
    const now = c.currentTime;

    // Sharp acoustic transient (wood on wood contact)
    const osc1 = c.createOscillator();
    const gain1 = c.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(1050 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(320 * pitch, now + 0.012);

    gain1.gain.setValueAtTime(volume * 0.95, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc1.connect(gain1).connect(c.destination);
    osc1.start(now);
    osc1.stop(now + 0.016);

    // Hollow wooden cavity body resonance
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(560 * pitch, now);
    osc2.frequency.exponentialRampToValueAtTime(240 * pitch, now + 0.038);

    gain2.gain.setValueAtTime(volume * 0.9, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    osc2.connect(gain2).connect(c.destination);
    osc2.start(now);
    osc2.stop(now + 0.042);

    // Low-end warm acoustic thud
    const osc3 = c.createOscillator();
    const gain3 = c.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(190 * pitch, now);
    osc3.frequency.exponentialRampToValueAtTime(70 * pitch, now + 0.028);

    gain3.gain.setValueAtTime(volume * 0.75, now);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    osc3.connect(gain3).connect(c.destination);
    osc3.start(now);
    osc3.stop(now + 0.032);
  } catch {
    // AudioContext blocked
  }
}

/**
 * 2. Muted Tech:
 * Ultra-crisp, lubed tactile mechanical keyboard switch / modern haptic snap.
 */
export function playMutedTech(pitch = 1, volume = 0.22) {
  try {
    const c = ac();
    const now = c.currentTime;

    // High micro-transient (stem contact)
    const osc1 = c.createOscillator();
    const gain1 = c.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(2400 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(450 * pitch, now + 0.007);

    gain1.gain.setValueAtTime(volume * 0.85, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);

    osc1.connect(gain1).connect(c.destination);
    osc1.start(now);
    osc1.stop(now + 0.01);

    // Damped housing acoustic bump
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(340 * pitch, now);
    osc2.frequency.exponentialRampToValueAtTime(95 * pitch, now + 0.016);

    gain2.gain.setValueAtTime(volume * 0.95, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc2.connect(gain2).connect(c.destination);
    osc2.start(now);
    osc2.stop(now + 0.02);
  } catch {
    // AudioContext blocked
  }
}

/**
 * 3. Muted Tick:
 * Damped acoustic haptic micro-tick.
 */
export function playMutedTick(pitch = 1, volume = 0.22) {
  try {
    const c = ac();
    const now = c.currentTime;

    const osc1 = c.createOscillator();
    const gain1 = c.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1600 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(360 * pitch, now + 0.009);

    gain1.gain.setValueAtTime(volume * 0.75, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);

    osc1.connect(gain1).connect(c.destination);
    osc1.start(now);
    osc1.stop(now + 0.012);

    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(260 * pitch, now);
    osc2.frequency.exponentialRampToValueAtTime(75 * pitch, now + 0.018);

    gain2.gain.setValueAtTime(volume * 0.9, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

    osc2.connect(gain2).connect(c.destination);
    osc2.start(now);
    osc2.stop(now + 0.025);
  } catch {
    // AudioContext blocked
  }
}

/**
 * 4. Soft Pop:
 * Rounded, hollow acoustic bubble pop.
 */
export function playSoftPop(pitch = 1, volume = 0.25) {
  try {
    const c = ac();
    const now = c.currentTime;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(340 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(780 * pitch, now + 0.013);
    osc.frequency.exponentialRampToValueAtTime(280 * pitch, now + 0.036);

    gain.gain.setValueAtTime(volume * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch {
    // AudioContext blocked
  }
}

/**
 * 5. Analog Dial:
 * Precision dual-click camera shutter / rotary ratchet latch.
 */
export function playAnalogDial(pitch = 1, volume = 0.23) {
  try {
    const c = ac();
    const now = c.currentTime;

    // Single crisp mechanical shutter latch click
    const osc1 = c.createOscillator();
    const gain1 = c.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1900 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(450 * pitch, now + 0.009);

    gain1.gain.setValueAtTime(volume * 0.85, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.011);

    osc1.connect(gain1).connect(c.destination);
    osc1.start(now);
    osc1.stop(now + 0.013);
  } catch {
    // AudioContext blocked
  }
}

/**
 * Preview a sound theme immediately (used in Settings and theme pickers)
 */
export function previewSoundTheme(theme: SoundTheme) {
  switch (theme) {
    case "onetick":
      playMutedTick(1.08, 0.24);
      break;
    case "woodchop":
      playWoodChop(1.05, 0.26);
      break;
    case "mutedtech":
      playMutedTech(1.08, 0.24);
      break;
    case "mutedtick":
      playMutedTick(1.06, 0.24);
      break;
    case "softpop":
      playSoftPop(1.05, 0.26);
      break;
    case "analogdial":
      playAnalogDial(1.06, 0.24);
      break;
    case "mute":
    default:
      break;
  }
}

/**
 * Master card transition sound that triggers the user's selected sound theme.
 * Gives immediate tactile acoustic satisfaction between cards with 1:1 precision (one move = one sound).
 */
export function playCardTransition(direction: "next" | "prev" = "next") {
  const theme = getSoundTheme();
  if (theme === "mute") return;

  const isNext = direction === "next";
  const basePitch = isNext ? 1.05 : 0.94;

  switch (theme) {
    case "onetick":
      // Precision micro-tick: exactly 1 clean tick per move
      playMutedTick(basePitch * 1.08, 0.22);
      break;

    case "woodchop":
      // Single organic hollow wood tap (no double-tap horse sound)
      playWoodChop(basePitch * 1.05, 0.28);
      break;

    case "mutedtech":
      // Single mechanical switch click
      playMutedTech(basePitch * 1.06, 0.24);
      break;

    case "softpop":
      // Single soft bubble pop
      playSoftPop(basePitch * 1.04, 0.25);
      break;

    case "analogdial":
      // Single rotary latch click
      playAnalogDial(basePitch * 1.02, 0.23);
      break;

    case "mutedtick":
    default:
      playMutedTick(basePitch * 1.05, 0.22);
      break;
  }
}

// General button click uses the current sound theme or muted tick
export const playClick = () => {
  const theme = getSoundTheme();
  if (theme === "mute") return;
  switch (theme) {
    case "onetick":
      playMutedTick(1.08, 0.2);
      break;
    case "woodchop":
      playWoodChop(1.0, 0.18);
      break;
    case "mutedtech":
      playMutedTech(1.0, 0.16);
      break;
    case "softpop":
      playSoftPop(1.0, 0.18);
      break;
    case "analogdial":
      playAnalogDial(1.0, 0.16);
      break;
    default:
      playMutedTick(1.0, 0.18);
      break;
  }
};

export const playCorrect = () => {
  playMutedTick(1.3, 0.22);
  try {
    const c = ac();
    const now = c.currentTime + 0.03;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // ignore
  }
};

export const playError = () => {
  try {
    const c = ac();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    // ignore
  }
};

export const playClimax = () => {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playMutedTick(f / 600, 0.2), i * 70);
  });
};
