import { createFileRoute } from "@tanstack/react-router";

// Free Google Translate TTS endpoint. Long text is split into chunks (<=200 chars)
// and the resulting MP3 buffers are concatenated. Most players handle naively
// concatenated MP3 frames just fine.
async function fetchChunk(text: string, lang: string): Promise<ArrayBuffer> {
  const clean = text
    .replace(/[#*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const urls = [
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${lang}&client=tw-ob&ttsspeed=1`,
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${lang}&client=gtx&ttsspeed=1`,
    `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${lang}&q=${encodeURIComponent(clean)}`,
  ];

  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Referer: "https://translate.google.com/",
          Accept: "*/*",
        },
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 0) return buf;
      } else {
        lastErr = new Error(`TTS HTTP status ${res.status} from ${url}`);
      }
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error("All TTS audio sources failed");
}

function splitForTts(text: string, maxLen = 180): string[] {
  const parts: string[] = [];
  // split on whitespace then greedily pack
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxLen) {
      if (cur) parts.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text") ?? "";
        const lang = url.searchParams.get("lang") ?? "en";
        if (!text.trim()) {
          return new Response("missing text", { status: 400 });
        }
        try {
          const chunks = splitForTts(text);
          const buffers = await Promise.all(chunks.map((c) => fetchChunk(c, lang)));
          const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const b of buffers) {
            merged.set(new Uint8Array(b), offset);
            offset += b.byteLength;
          }
          return new Response(merged, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          return new Response(`tts error: ${(e as Error).message}`, { status: 502 });
        }
      },
    },
  },
} as never);
