// Ultra-fast zero-latency TTS engine with pitch-preserved 900+ WPM capabilities
// Architecture:
// 1. Google Translate TTS proxy (/api/tts) with server chunk concatenation
// 2. Client Blob URL caching & prewarmed HTMLMediaElement instances for 0ms transitions
// 3. True pitch-preserves hardware time-stretching up to 16x speed
// 4. Fallback to Web Speech API if offline/proxy is unavailable

export const BASE_WPM_EN = 150;
export const BASE_WPM_AR = 120;

const urlCache = new Map<string, string>();
const inflightFetches = new Map<string, Promise<string>>();
const prewarmedAudioElements = new Map<string, HTMLAudioElement>();

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

export function cleanText(text: string): string {
  return text
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "")
    .replace(/[#*_`~>]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure character-range counting language detection
 * Unicode blocks: Arabic (U+0600–06FF), Arabic Supplement (U+0750–077F), Arabic Extended-A (U+08A0–08FF).
 * If >30% of non-whitespace characters are Arabic => "ar", otherwise "en".
 */
export function detectLang(text: string): "en" | "ar" {
  const arabicRe = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
  const arabicCount = (text.match(arabicRe) || []).length;
  const nonSpace = text.replace(/\s/g, "").length;
  return nonSpace > 0 && arabicCount / nonSpace > 0.3 ? "ar" : "en";
}

export async function getAudioUrl(text: string, lang: "en" | "ar"): Promise<string> {
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error("Empty text for TTS");
  const key = `${lang}::${cleaned}`;

  const cached = urlCache.get(key);
  if (cached) return cached;

  const pending = inflightFetches.get(key);
  if (pending) return pending;

  const fetchPromise = (async () => {
    const res = await fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(cleaned)}`);
    if (!res.ok) {
      throw new Error(`TTS HTTP error: ${res.status}`);
    }
    const blob = await res.blob();
    if (blob.size < 50) {
      throw new Error("Invalid or empty TTS audio blob received");
    }
    const blobUrl = URL.createObjectURL(blob);
    urlCache.set(key, blobUrl);
    return blobUrl;
  })();

  inflightFetches.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightFetches.delete(key);
  }
}

function prewarmElement(key: string, url: string): HTMLAudioElement {
  let audio = prewarmedAudioElements.get(key);
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    try {
      audio.load();
    } catch {
      /* ignore */
    }
    prewarmedAudioElements.set(key, audio);
  }
  return audio;
}

/**
 * Pre-fetches and pre-buffers audio for upcoming cards so transitions have 0ms buffer delay.
 */
export function prefetchTts(text: string, lang?: "en" | "ar"): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanText(text);
  if (!cleaned) return;
  const targetLang = lang || detectLang(cleaned);
  const key = `${targetLang}::${cleaned}`;

  void getAudioUrl(cleaned, targetLang)
    .then((url) => {
      prewarmElement(key, url);
    })
    .catch(() => {});
}

/**
 * Pre-fetches multiple queue items ahead of time
 */
export function prefetchBatchTts(items: Array<{ text: string; lang?: "en" | "ar" }>): void {
  if (typeof window === "undefined" || !items.length) return;
  for (const item of items) {
    prefetchTts(item.text, item.lang);
  }
}

// Native Web Speech API Fallback (Safety net)
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

  const cleaned = cleanText(text);
  if (!cleaned) {
    onEnd?.("ended");
    return { stop: () => {}, ended: Promise.resolve("ended") };
  }

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
  const baseWpm = lang === "ar" ? BASE_WPM_AR : BASE_WPM_EN;
  utterance.rate = Math.max(0.5, Math.min(4, wpm / baseWpm));

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
    console.warn("WebSpeech utterance fallback error:", e);
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

/**
 * Main high-fidelity TTS playback engine
 * Supports rates up to 16x (e.g. 900+ WPM) with natural pitch preservation and 0ms latency
 */
export async function speak(
  text: string,
  lang?: "en" | "ar",
  wpm = 180,
  onEnd?: (reason: TtsEndReason) => void,
): Promise<TtsHandle> {
  unlockAudio();

  const cleaned = cleanText(text);
  if (!cleaned) {
    onEnd?.("ended");
    return { stop: () => {}, ended: Promise.resolve("ended") };
  }

  const targetLang = lang || detectLang(cleaned);
  const key = `${targetLang}::${cleaned}`;
  const baseWpm = targetLang === "ar" ? BASE_WPM_AR : BASE_WPM_EN;
  const playbackRate = Math.max(0.25, Math.min(16, wpm / baseWpm));

  try {
    const url = await getAudioUrl(cleaned, targetLang);
    let audio = prewarmedAudioElements.get(key);

    if (audio) {
      prewarmedAudioElements.delete(key);
    } else {
      audio = new Audio(url);
      audio.preload = "auto";
    }

    audio.currentTime = 0;

    // Standard & vendor pitch preservation for natural voice at 900+ WPM
    audio.preservesPitch = true;
    (audio as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
    (audio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    audio.playbackRate = playbackRate;

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
      // Put a fresh prewarmed element back into the pool for instant replay/loops
      prewarmElement(key, url);
    };

    audio.onerror = () => {
      finish("error");
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
      // Re-affirm playback rate & preservesPitch after playback starts
      audio.preservesPitch = true;
      audio.playbackRate = playbackRate;
    }

    return {
      stop: () => finish("stopped"),
      ended,
    };
  } catch (err) {
    console.warn("Server TTS engine error, falling back to Web Speech:", err);
    return speakWebSpeech(cleaned, targetLang, wpm, onEnd);
  }
}

export async function speakRepeat(
  text: string,
  lang?: "en" | "ar",
  wpm = 180,
  times = 3,
  pauseMs = 300,
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
