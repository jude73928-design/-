import fs from "node:fs";
import path from "node:path";

async function prerender() {
  console.log("Prerendering routes for static and deployment hosts...");

  const distDir = path.resolve("dist");
  const publicDir = path.resolve(".output/public");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy all assets from .output/public into dist if they exist
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, distDir, { recursive: true });
  }

  try {
    const ssrModule = await import("../.output/server/_ssr/index.mjs");
    const app = ssrModule.default || ssrModule;

    const routes = [
      { path: "/", file: "index.html" },
      { path: "/study", file: "study/index.html" },
      { path: "/dashboard", file: "dashboard/index.html" },
    ];

    let rootHtml = "";

    for (const route of routes) {
      try {
        const req = new Request(`http://localhost:3000${route.path}`, {
          headers: {
            "user-agent": "Mozilla/5.0 PrerenderBot",
            accept: "text/html,application/xhtml+xml",
          },
        });
        const res = await app.fetch(req);
        if (res.status === 200) {
          const html = await res.text();
          if (route.path === "/") {
            rootHtml = html;
          }

          // Write to dist
          const distTarget = path.join(distDir, route.file);
          fs.mkdirSync(path.dirname(distTarget), { recursive: true });
          fs.writeFileSync(distTarget, html, "utf8");

          // Write to .output/public
          const pubTarget = path.join(publicDir, route.file);
          fs.mkdirSync(path.dirname(pubTarget), { recursive: true });
          fs.writeFileSync(pubTarget, html, "utf8");

          console.log(`✓ Prerendered ${route.path} -> ${route.file}`);
        } else {
          console.warn(`! Failed to prerender ${route.path}: HTTP status ${res.status}`);
        }
      } catch (err) {
        console.warn(`! Error prerendering ${route.path}:`, err);
      }
    }

    // Also write fallback index.html / 200.html / 404.html for SPA static hosting (Vercel, Netlify, Cloudflare, GitHub Pages)
    if (rootHtml) {
      for (const fallback of ["200.html", "404.html"]) {
        fs.writeFileSync(path.join(distDir, fallback), rootHtml, "utf8");
        fs.writeFileSync(path.join(publicDir, fallback), rootHtml, "utf8");
      }
      console.log("✓ Created 200.html and 404.html SPA fallbacks.");
    }
  } catch (err) {
    console.error("Prerendering step encountered an issue:", err);
  }
}

prerender();
