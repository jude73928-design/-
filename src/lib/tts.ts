// TTS player with dual-engine reliability:
// 1. High-quality HTMLAudioElement MP3 player using /api/tts
// 2. Seamless local Web Speech API (speechSynthesis) fallback for 100% voice playback guarantee.

const BASE_WPM = 150;

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const warmedAudio = new Map<string, HTMLAudioElement>();

export type TtsEndReason = "ended" | "stopped" | "error";

export type TtsHandle = {
  stop: () => void;
  ended: Promise<TtsEndReason>;
};

// Global audio unlock state
let isAudioUnlocked = false;
let unlockAudioElement: HTMLAudioElement | null = null;

export function unlockAudio(): void {
  if (typeof window === "undefined" || isAudioUnlocked) return;
  try {
    if (!unlockAudioElement) {
      unlockAudioElement = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
      );
    }
    const p = unlockAudioElement.play();
    if (p !== undefined) {
      p.then(() => {
        unlockAudioElement?.pause();
        isAudioUnlocked = true;
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  const events = ["pointerdown", "touchstart", "click", "keydown"];
  const handleUnlock = () => {
    unlockAudio();
    events.forEach((evt) => window.removeEventListener(evt, handleUnlock));
  };
  events.forEach((evt) => window.addEventListener(evt, handleUnlock, { passive: true }));
}

async function getAudioUrl(text: string, lang: "en" | "ar"): Promise<string> {
  const clean = text.replace(/#+/g, "").replace(/\s+/g, " ").trim();
  const key = `${lang}::${clean}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const res = await fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(clean)}`);
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    const blob = await res.blob();
    if (blob.size < 100) throw new Error("Invalid TTS audio blob");
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

function warmAudio(url: string): void {
  if (warmedAudio.has(url)) return;
  const a = new Audio();
  a.preload = "auto";
  a.src = url;
  try {
    a.load();
  } catch {
    /* ignore */
  }
  warmedAudio.set(url, a);
}

export function prefetchTts(text: string, lang: "en" | "ar"): void {
  void getAudioUrl(text, lang)
    .then(warmAudio)
    .catch(() => {});
}

// Native Web Speech API Fallback (SpeechSynthesis)
export function speakWebSpeech(
  text: string,
  lang: "en" | "ar",
  wpm: number,
  onEnd?: (reason: TtsEndReason) => void,
): TtsHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.("error");
    return { stop: () => {}, ended: Promise.resolve("error") };
  }

  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }

  const clean = text.replace(/#+/g, "").replace(/\s+/g, " ").trim();
  if (!clean) {
    onEnd?.("ended");
    return { stop: () => {}, ended: Promise.resolve("ended") };
  }

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
  const rate = Math.max(0.5, Math.min(2.2, wpm / BASE_WPM));
  utterance.rate = rate;

  let resolveEnded!: (r: TtsEndReason) => void;
  const ended = new Promise<TtsEndReason>((r) => (resolveEnded = r));
  let settled = false;

  const finish = (reason: TtsEndReason) => {
    if (settled) return;
    settled = true;
    utterance.onend = null;
    utterance.onerror = null;
    onEnd?.(reason);
    resolveEnded(reason);
  };

  utterance.onend = () => finish("ended");
  utterance.onerror = (e) => {
    console.warn("WebSpeech utterance error:", e);
    finish("error");
  };

  try {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const targetLangPrefix = lang === "ar" ? "ar" : "en";
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(targetLangPrefix));
      if (match) utterance.voice = match;
    }
  } catch {
    /* ignore */
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("SpeechSynthesis error:", err);
    finish("error");
    return { stop: () => {}, ended: Promise.resolve("error") };
  }

  return {
    stop: () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      finish("stopped");
    },
    ended,
  };
}

export async function speak(
  text: string,
  lang: "en" | "ar",
  wpm: number,
  onEnd?: (reason: TtsEndReason) => void,
): Promise<TtsHandle> {
  unlockAudio();

  // Try Server /api/tts endpoint first
  try {
    const url = await getAudioUrl(text, lang);
    warmAudio(url);
    const warmed = warmedAudio.get(url);
    warmedAudio.delete(url);
    const audio = warmed ?? new Audio(url);
    audio.preload = "auto";
    audio.currentTime = 0;
    const rate = Math.max(0.25, wpm / BASE_WPM);
    audio.preservesPitch = true;
    (audio as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
    (audio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    audio.playbackRate = rate;

    let resolveEnded!: (r: TtsEndReason) => void;
    const ended = new Promise<TtsEndReason>((r) => (resolveEnded = r));
    let settled = false;

    const finish = (reason: TtsEndReason) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      onEnd?.(reason);
      resolveEnded(reason);
    };

    audio.onended = () => {
      finish("ended");
      warmAudio(url);
    };
    audio.onerror = () => finish("error");

    await audio.play();
    audio.playbackRate = rate;

    return {
      stop: () => finish("stopped"),
      ended,
    };
  } catch (err) {
    console.warn(
      "Server TTS audio failed or was blocked by browser. Falling back to Web Speech API:",
      err,
    );
    return speakWebSpeech(text, lang, wpm, onEnd);
  }
}

export async function speakRepeat(
  text: string,
  lang: "en" | "ar",
  wpm = 180,
  times = 3,
  pauseMs = 450,
  onProgress?: (currentIteration: number, total: number) => void,
  onEnd?: (reason: TtsEndReason) => void,
): Promise<TtsHandle> {
  let isStopped = false;
  let currentHandle: TtsHandle | null = null;
  let resolveEnded!: (r: TtsEndReason) => void;
  const ended = new Promise<TtsEndReason>((r) => (resolveEnded = r));

  const stop = () => {
    isStopped = true;
    if (currentHandle) {
      currentHandle.stop();
    }
    resolveEnded("stopped");
    onEnd?.("stopped");
  };

  (async () => {
    for (let i = 1; i <= times; i++) {
      if (isStopped) break;
      onProgress?.(i, times);
      try {
        currentHandle = await speak(text, lang, wpm);
        const reason = await currentHandle.ended;
        if (reason !== "ended" || isStopped) {
          if (!isStopped) {
            resolveEnded(reason);
            onEnd?.(reason);
          }
          return;
        }
        if (i < times && !isStopped) {
          await new Promise((resolve) => setTimeout(resolve, pauseMs));
        }
      } catch {
        if (!isStopped) {
          resolveEnded("error");
          onEnd?.("error");
        }
        return;
      }
    }
    if (!isStopped) {
      resolveEnded("ended");
      onEnd?.("ended");
    }
  })();

  return { stop, ended };
}

export function detectLang(text: string): "en" | "ar" {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}
