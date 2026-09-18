export function detectLanguage(text: string): "ar" | "en" {
  if (!text || !text.trim()) return "en";
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const latinRegex = /[a-zA-Z]/g;
  const arCount = (text.match(arabicRegex) || []).length;
  const enCount = (text.match(latinRegex) || []).length;
  if (arCount > 0 && (enCount === 0 || arCount >= enCount)) return "ar";
  return enCount > arCount ? "en" : arCount > 0 ? "ar" : "en";
}

export function chunkText(text: string, maxChunkSize: number = 1800): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkSize) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining.trim());
      break;
    }
    const sliceEnd = maxChunkSize;
    let cutIdx = remaining.lastIndexOf("\n\n", sliceEnd);
    if (cutIdx === -1 || cutIdx < maxChunkSize * 0.3) {
      const sentenceEnders = [". ", "! ", "? ", ".\n", "!\n", "?\n", "؛ "];
      for (const ender of sentenceEnders) {
        const idx = remaining.lastIndexOf(ender, sliceEnd);
        if (idx > cutIdx && idx >= maxChunkSize * 0.3) {
          cutIdx = idx + ender.length;
        }
      }
    }
    if (cutIdx === -1 || cutIdx < maxChunkSize * 0.3) {
      cutIdx = remaining.lastIndexOf(" ", sliceEnd);
    }
    if (cutIdx === -1 || cutIdx < maxChunkSize * 0.3) {
      cutIdx = sliceEnd;
    }
    chunks.push(remaining.slice(0, cutIdx).trim());
    remaining = remaining.slice(cutIdx).trim();
  }
  return chunks.filter((c) => c.length > 0);
}

export interface TranslationResult {
  text: string;
  sourceLang: "ar" | "en";
  targetLang: "ar" | "en";
  alternatives?: string[];
}

// Single phrase translation (0ms in-memory cache)
const phraseCache = new Map<string, TranslationResult>();

// Direct client-side fallback with host rotation in case server route is unreachable
async function directFallbackTranslate(
  text: string,
  sl: string,
  tl: string,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  const hosts = ["https://translate.googleapis.com", "https://translate.google.com"];
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const url = `${host}/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dt=bd`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "q=" + encodeURIComponent(text),
        signal,
      });
      if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
      const data = await res.json();
      let translated = "";
      if (Array.isArray(data) && Array.isArray(data[0])) {
        translated = data[0].map((s: Array<string | null>) => s?.[0] || "").join("");
      }
      const alternatives: string[] = [];
      if (Array.isArray(data?.[1])) {
        for (const entry of data[1]) {
          if (Array.isArray(entry?.[1])) {
            for (const alt of entry[1]) {
              if (typeof alt === "string" && alt !== translated && !alternatives.includes(alt)) {
                alternatives.push(alt);
              }
              if (alternatives.length >= 6) break;
            }
          }
        }
      }
      return {
        text: translated || text,
        sourceLang: (sl === "ar" ? "ar" : "en") as "ar" | "en",
        targetLang: (tl === "ar" ? "ar" : "en") as "ar" | "en",
        alternatives: alternatives.length > 0 ? alternatives : undefined,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Direct fallback translation failed");
}

export async function translatePhrase(
  phrase: string,
  options: { forceTargetLang?: "ar" | "en"; signal?: AbortSignal } = {},
): Promise<TranslationResult> {
  const clean = phrase.trim();
  if (!clean) return { text: "", sourceLang: "en", targetLang: "ar" };

  const detected = detectLanguage(clean);
  const targetLang = options.forceTargetLang || (detected === "ar" ? "en" : "ar");
  const cacheKey = `${clean}::${targetLang}`;
  if (phraseCache.has(cacheKey)) {
    return phraseCache.get(cacheKey)!;
  }

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean,
        sourceLang: options.forceTargetLang ? detected : "auto",
        targetLang,
        withDict: true,
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`Server translation returned ${res.status}`);
    }

    const data = await res.json();
    const result: TranslationResult = {
      text: data.translatedText || clean,
      sourceLang: data.sourceLang || detected,
      targetLang: data.targetLang || targetLang,
      alternatives: data.alternatives,
    };
    phraseCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }
    // Fallback to direct client fetch
    try {
      const fallbackResult = await directFallbackTranslate(
        clean,
        options.forceTargetLang ? detected : "auto",
        targetLang,
        options.signal,
      );
      phraseCache.set(cacheKey, fallbackResult);
      return fallbackResult;
    } catch {
      return {
        text: clean,
        sourceLang: detected,
        targetLang,
      };
    }
  }
}

// Batch translator for massive text (articles, decks, books)
export async function batchTranslate(
  fullText: string,
  options: {
    sourceLang?: "auto" | "ar" | "en";
    targetLang?: "ar" | "en";
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<{
  translatedText: string;
  sourceLang: "ar" | "en";
  targetLang: "ar" | "en";
  chunksCount: number;
}> {
  const { sourceLang = "auto", concurrency = 8, signal, onProgress } = options;
  const detected = detectLanguage(fullText);
  const effectiveSource = sourceLang === "auto" ? detected : sourceLang;
  const effectiveTarget = options.targetLang || (effectiveSource === "ar" ? "en" : "ar");

  const chunks = chunkText(fullText, 1800);
  const translated = new Array<string>(chunks.length);
  let completed = 0;

  for (let i = 0; i < chunks.length; i += concurrency) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = chunks.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (chunk, batchOffset) => {
        const chunkIndex = i + batchOffset;
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: chunk,
              sourceLang: effectiveSource,
              targetLang: effectiveTarget,
            }),
            signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          translated[chunkIndex] = data.translatedText || chunk;
        } catch (e) {
          if (signal?.aborted) throw e;
          // Direct fallback
          try {
            const fallback = await directFallbackTranslate(
              chunk,
              effectiveSource,
              effectiveTarget,
              signal,
            );
            translated[chunkIndex] = fallback.text || chunk;
          } catch {
            translated[chunkIndex] = chunk;
          }
        }
        completed++;
        onProgress?.(completed, chunks.length);
      }),
    );
  }

  return {
    translatedText: translated.join("\n\n"),
    sourceLang: effectiveSource,
    targetLang: effectiveTarget,
    chunksCount: chunks.length,
  };
}
