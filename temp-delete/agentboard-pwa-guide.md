# Agent Board → PWA: Feature Branch Implementation Guide

## Overview

This guide adds Progressive Web App (PWA) support to [Agent Board](https://github.com/gbasin/agentboard) using `vite-plugin-pwa`. The result: Agent Board becomes installable from any browser's "Add to Home Screen" and launches full-screen with no browser chrome — ideal for a tmux controller accessed over Tailscale.

**Stack context:** Vite + TypeScript + React + Tailwind CSS + Bun + Hono backend

---

## Setup: Create the Feature Branch

```bash
# Fork and clone
git clone https://github.com/<your-username>/agentboard.git
cd agentboard

# Create feature branch
git checkout -b feature/pwa-support

# Install the plugin
bun add -d vite-plugin-pwa
```

---

## Step 1: Update `vite.config.ts`

Add the `VitePWA` plugin to the existing Vite config. Agent Board already has a `vite.config.ts` — you're just adding the import and plugin entry.

```typescript
// Add this import at the top of vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

// Then add VitePWA({...}) to your plugins array:
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Agent Board',
    short_name: 'AgentBoard',
    description: 'Web GUI for tmux optimized for AI agent TUIs',
    theme_color: '#0f172a',       // slate-900, matches the dark UI
    background_color: '#0f172a',
    display: 'standalone',        // full-screen, no browser chrome
    orientation: 'any',           // works portrait + landscape
    start_url: '/',
    icons: [
      {
        src: '/icons/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  },
  workbox: {
    // Only cache the app shell — NOT the WebSocket or API calls
    // Agent Board is useless offline (needs live tmux), so we
    // only cache static assets for faster reload
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    // Don't cache the WebSocket upgrade or API routes
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api/, /^\/ws/],
    runtimeCaching: [
      {
        // Cache font files if any are loaded externally
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
  // Enable in dev for testing (optional — remove for production PR)
  // devOptions: {
  //   enabled: true,
  // },
})
```

### Important notes on the config

- **`display: 'standalone'`** — This is what makes it launch full-screen on iOS/Android without browser chrome. Exactly what you want for a tmux controller.
- **`navigateFallbackDenylist`** — Critical. Agent Board uses WebSockets (`/ws`) and API routes (`/api`). Without this denylist, the service worker would try to serve cached HTML for those routes and break everything.
- **`globPatterns`** — Only caches static assets. There's no point caching API responses since Agent Board needs a live server connection to function.
- **`registerType: 'autoUpdate'`** — Silently updates the service worker when new versions deploy. No annoying "update available" prompts.

---

## Step 2: Create PWA Icons

You need at minimum a 192x192 and 512x512 PNG icon. Place them in `public/icons/`.

```bash
mkdir -p public/icons
```

**Option A: Quick placeholder** (for development)

```bash
# Generate simple placeholder icons with ImageMagick
convert -size 512x512 xc:'#0f172a' -fill white -gravity center \
  -pointsize 72 -annotate 0 'AB' public/icons/pwa-512x512.png
convert public/icons/pwa-512x512.png -resize 192x192 public/icons/pwa-192x192.png
```

**Option B: Use the existing favicon**

If Agent Board already has an icon in `public/`, resize it:

```bash
convert public/favicon.png -resize 512x512 public/icons/pwa-512x512.png
convert public/favicon.png -resize 192x192 public/icons/pwa-192x192.png
```

**Option C: Use @vite-pwa/assets-generator** (recommended for production)

```bash
bun add -d @vite-pwa/assets-generator
# Create a single high-res source image, then:
bunx pwa-assets-generator --preset minimal-2023 public/source-icon.svg
```

This generates all the icon sizes, apple-touch-icon, and maskable variants automatically.

---

## Step 3: Add Apple Touch Icon to `index.html`

iOS Safari needs an explicit `<link>` tag. Add this to the `<head>` in `index.html`:

```html
<!-- PWA: Apple touch icon for iOS home screen -->
<link rel="apple-touch-icon" href="/icons/pwa-192x192.png" />

<!-- PWA: Theme color for mobile browsers -->
<meta name="theme-color" content="#0f172a" />
```

The `vite-plugin-pwa` automatically injects the `<link rel="manifest">` tag, so you don't need to add that manually.

---

## Step 4: Verify the Build

```bash
# Build and check that PWA files are generated
bun run build

# You should see these extra files in the output:
# - manifest.webmanifest
# - sw.js (service worker)
# - registerSW.js
# - workbox-*.js
```

Then test in production mode:

```bash
bun run start
# Open http://localhost:4040 in Chrome
# Check DevTools → Application → Manifest (should show your config)
# Check DevTools → Application → Service Workers (should be registered)
```

---

## Step 5: Test PWA Installation

**On Desktop (Chrome/Edge):**
- Navigate to your Agent Board instance
- Look for the install icon in the address bar (or ⋮ → "Install Agent Board")
- Click it — the app should open in its own window with no browser chrome

**On iOS Safari:**
- Navigate to your Agent Board instance over Tailscale
- Tap Share → "Add to Home Screen"
- Launch from the home screen icon
- Should open full-screen, no Safari UI

**On Android Chrome:**
- Navigate to your Agent Board instance
- Chrome should show an "Add to Home Screen" banner automatically
- Or use ⋮ → "Add to Home Screen" / "Install app"

---

## Step 6: Commit and Push

```bash
git add -A
git commit -m "feat: add PWA support for installable home screen experience

- Add vite-plugin-pwa with standalone display mode
- Configure service worker to cache app shell only
- Exclude WebSocket and API routes from SW caching
- Add PWA icons (192x192 and 512x512)
- Add apple-touch-icon for iOS Safari support

Agent Board can now be installed from any browser's 'Add to Home
Screen' and launches full-screen without browser chrome. Ideal for
accessing over Tailscale from mobile devices."

git push origin feature/pwa-support
```

---

## What This Does NOT Do (By Design)

- **No offline mode** — Agent Board requires a live tmux connection. The service worker only caches static assets for faster page loads, not for offline functionality.
- **No push notifications** — Not needed for this use case.
- **No app store packaging** — Since you access Agent Board over Tailscale, there's no benefit to wrapping it for the Play Store or App Store. The PWA "Add to Home Screen" gives you the same experience.

---

## Troubleshooting

**"Install" button doesn't appear in Chrome:**
- Must be served over HTTPS (or localhost). Tailscale HTTPS certificates work.
- Manifest must have at least one 192x192 and one 512x512 icon.
- Service worker must be registered successfully.

**iOS doesn't show full-screen:**
- Ensure `display: 'standalone'` is set in the manifest.
- Must be added via Share → "Add to Home Screen" (not bookmarked).
- The `apple-touch-icon` link tag must be present in `index.html`.

**Service worker interferes with WebSocket:**
- The `navigateFallbackDenylist: [/^\/api/, /^\/ws/]` should prevent this.
- If issues persist, add `ignoreURLParametersMatching: [/./]` to workbox config.

**Hot reload broken in dev:**
- By default, the PWA plugin only activates in production builds.
- If you enabled `devOptions: { enabled: true }`, the service worker may cache dev assets. Unregister it in DevTools → Application → Service Workers.
