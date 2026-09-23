import type { NextConfig } from "next";

/**
 * GitHub Pages serves the game from a sub-path (`/contest-unlayer-gta`).
 * `.github/workflows/deploy-pages.yml` builds with PAGES_BASE_PATH set to
 * that path, which switches on the static export. A plain `npm run build`
 * stays a normal build for `next start`.
 */
const pagesBasePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig =
  pagesBasePath === undefined
    ? {}
    : {
        output: "export",
        basePath: pagesBasePath,
        images: { unoptimized: true },
        // `basePath` prefixes routes and bundles, not string URLs into
        // `public/` — the briefing plates read this to find their files
        env: { NEXT_PUBLIC_BASE_PATH: pagesBasePath },
      };

export default nextConfig;
