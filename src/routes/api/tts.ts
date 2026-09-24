import { createFileRoute } from "@tanstack/react-router";

// In-memory LRU-like cache for ultra-fast zero-latency TTS responses
const serverTtsCache = new Map<string, Uint8Array>();
const MAX_CACHE_ITEMS = 500;

function cleanTextForTts(text: string): string {
  return text
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "") // remove citation marks like [1, 2]
    .replace(/[#*_`~>]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitForTts(text: string, maxLen = 175): string[] {
  const clean = cleanTextForTts(text);
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const parts: string[] = [];
  const words = clean.split(" ");
  let cur = "";

  for (const w of words) {
    if ((cur + " " + w).trim().length > maxLen) {
      if (cur) parts.push(cur);
      // If a single word is abnormally long (>maxLen), slice it safely
      if (w.length > maxLen) {
        let remaining = w;
        while (remaining.length > maxLen) {
          parts.push(remaining.slice(0, maxLen));
          remaining = remaining.slice(maxLen);
        }
        cur = remaining;
      } else {
        cur = w;
      }
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

async function fetchChunk(chunkText: string, lang: string): Promise<Uint8Array> {
  const cacheKey = `${lang}::${chunkText}`;
  const cached = serverTtsCache.get(cacheKey);
  if (cached) return cached;

  const targetLang = lang === "ar" ? "ar" : "en";
  const urls = [
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${targetLang}&q=${encodeURIComponent(chunkText)}&ttsspeed=1`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&tl=${targetLang}&q=${encodeURIComponent(chunkText)}`,
    `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${targetLang}&q=${encodeURIComponent(chunkText)}`,
  ];

  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://translate.google.com/",
          Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.8",
        },
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 0) {
          const uint8 = new Uint8Array(buf);
          if (serverTtsCache.size >= MAX_CACHE_ITEMS) {
            const firstKey = serverTtsCache.keys().next().value;
            if (firstKey) serverTtsCache.delete(firstKey);
          }
          serverTtsCache.set(cacheKey, uint8);
          return uint8;
        }
      } else {
        lastErr = new Error(`TTS endpoint returned status ${res.status}`);
      }
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error("All TTS audio endpoints failed");
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text") ?? url.searchParams.get("q") ?? "";
        const lang = (
          url.searchParams.get("lang") ??
          url.searchParams.get("tl") ??
          "en"
        ).toLowerCase();

        const clean = cleanTextForTts(text);
        if (!clean) {
          return new Response("missing or empty text", { status: 400 });
        }

        const fullCacheKey = `FULL::${lang}::${clean}`;
        const cachedFull = serverTtsCache.get(fullCacheKey);
        if (cachedFull) {
          return new Response(cachedFull, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
        }

        try {
          const chunks = splitForTts(clean, 175);
          if (chunks.length === 0) {
            return new Response("empty text chunks", { status: 400 });
          }

          // Fetch all chunks in parallel
          const buffers = await Promise.all(chunks.map((c) => fetchChunk(c, lang)));

          // Concatenate raw MP3 buffers seamlessly
          const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const b of buffers) {
            merged.set(b, offset);
            offset += b.byteLength;
          }

          if (serverTtsCache.size >= MAX_CACHE_ITEMS) {
            const firstKey = serverTtsCache.keys().next().value;
            if (firstKey) serverTtsCache.delete(firstKey);
          }
          serverTtsCache.set(fullCacheKey, merged);

          return new Response(merged, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
        } catch (e) {
          return new Response(`TTS engine error: ${(e as Error).message}`, { status: 502 });
        }
      },
    },
  },
} as never);
