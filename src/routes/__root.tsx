import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { registerServiceWorker } from "../lib/registerSW";
import { HighlightTranslateTooltip } from "@/components/HighlightTranslateTooltip";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0b0a14" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "spaced" },
      { title: "spaced" },
      {
        name: "description",
        content:
          "Arabic Study Pal is a dark-themed web app for learning Arabic and English vocabulary.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "spaced" },
      {
        property: "og:description",
        content:
          "Arabic Study Pal is a dark-themed web app for learning Arabic and English vocabulary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "spaced" },
      {
        name: "twitter:description",
        content:
          "Arabic Study Pal is a dark-themed web app for learning Arabic and English vocabulary.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0fd79d52-cc6d-4223-97bd-28613bdc835a/id-preview-a0acc74f--b733a6c1-e31c-408e-9db9-cf879f24ab76.lovable.app-1777798914830.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0fd79d52-cc6d-4223-97bd-28613bdc835a/id-preview-a0acc74f--b733a6c1-e31c-408e-9db9-cf879f24ab76.lovable.app-1777798914830.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return (
    <>
      <Outlet />
      <HighlightTranslateTooltip />
    </>
  );
}
