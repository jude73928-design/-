// TTS player using HTMLAudioElement with preservesPitch.
// Unlike AudioBufferSourceNode.playbackRate (which chipmunks),
// <audio>.playbackRate + preservesPitch does time-stretching that keeps
// the voice natural and intelligible even at 6x (≈900 WPM).
// Base WPM for Google Translate TTS is ~150.

const BASE_WPM = 150;

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
// Pre-warmed audio elements keyed by blob URL — having the element already
// created and `load()`ed lets play() start with no perceptible delay.
const warmedAudio = new Map<string, HTMLAudioElement>();

export type TtsEndReason = "ended" | "stopped" | "error";

export type TtsHandle = {
  stop: () => void;
  ended: Promise<TtsEndReason>;
};

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

export async function speak(
  text: string,
  lang: "en" | "ar",
  wpm: number,
  onEnd?: (reason: TtsEndReason) => void,
): Promise<TtsHandle> {
  const url = await getAudioUrl(text, lang);
  warmAudio(url);
  // Reuse the pre-warmed element so playback starts instantly with no
  // decoding/buffering delay. Remove from the warm pool so subsequent
  // replays get a fresh warmed instance.
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
    // Re-warm a fresh element for any future replay of the same text.
    warmAudio(url);
  };
  audio.onerror = () => finish("error");

  try {
    await audio.play();
    audio.playbackRate = rate;
  } catch (e) {
    finish("error");
    throw e;
  }

  return {
    stop: () => finish("stopped"),
    ended,
  };
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
      } catch (err) {
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
