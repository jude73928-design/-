import { createFileRoute } from "@tanstack/react-router";

// Arabic unicode blocks
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

async function handleTranslation(request: Request): Promise<Response> {
  try {
    let body: {
      text?: string;
      sourceLang?: string;
      targetLang?: string;
      withDict?: boolean;
    } = {};

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const rawText = await request.text();
      const params = new URLSearchParams(rawText);
      body = {
        text: params.get("text") || params.get("q") || "",
        sourceLang: params.get("sourceLang") || params.get("sl") || "auto",
        targetLang: params.get("targetLang") || params.get("tl") || "",
        withDict: params.get("withDict") === "true",
      };
    } else {
      const rawText = await request.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        const params = new URLSearchParams(rawText);
        body = {
          text: params.get("text") || params.get("q") || "",
          sourceLang: params.get("sourceLang") || params.get("sl") || "auto",
          targetLang: params.get("targetLang") || params.get("tl") || "",
          withDict: params.get("withDict") === "true",
        };
      }
    }

    const { text, sourceLang = "auto", targetLang = "", withDict = false } = body;
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isArabic = ARABIC_REGEX.test(text);
    const sl = sourceLang === "auto" ? (isArabic ? "ar" : "en") : sourceLang;
    const tl = targetLang || (sl === "ar" ? "en" : "ar");

    const hosts = ["https://translate.googleapis.com", "https://translate.google.com"];
    let lastError: unknown = null;

    for (const host of hosts) {
      try {
        const dt = withDict ? "&dt=t&dt=bd" : "&dt=t";
        const url = `${host}/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}${dt}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          body: "q=" + encodeURIComponent(text),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        let translated = "";
        if (Array.isArray(data) && Array.isArray(data[0])) {
          translated = data[0].map((s: Array<string | null>) => s?.[0] || "").join("");
        }

        const detected = data?.[2] || sl;
        const actualSource = detected === "ar" ? "ar" : detected === "en" ? "en" : sl;
        let finalTarget = tl;

        // Auto-correct if detected source equals target
        if (actualSource === tl && sourceLang === "auto") {
          finalTarget = actualSource === "ar" ? "en" : "ar";
          const retryRes = await fetch(
            `${host}/translate_a/single?client=gtx&sl=${actualSource}&tl=${finalTarget}${dt}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              },
              body: "q=" + encodeURIComponent(text),
            },
          );
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (Array.isArray(retryData?.[0])) {
              translated = retryData[0].map((s: Array<string | null>) => s?.[0] || "").join("");
            }
          }
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

        return new Response(
          JSON.stringify({
            translatedText: translated,
            detectedLang: actualSource,
            sourceLang: actualSource,
            targetLang: finalTarget,
            alternatives: alternatives.length > 0 ? alternatives : undefined,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=86400",
            },
          },
        );
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("All translation hosts failed");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        return handleTranslation(request);
      },
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text") || url.searchParams.get("q") || "";
        const sourceLang =
          url.searchParams.get("sourceLang") || url.searchParams.get("sl") || "auto";
        const targetLang = url.searchParams.get("targetLang") || url.searchParams.get("tl") || "";
        const withDict = url.searchParams.get("withDict") === "true";

        const dummyReq = new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sourceLang, targetLang, withDict }),
        });
        return handleTranslation(dummyReq);
      },
    },
  },
} as never);
