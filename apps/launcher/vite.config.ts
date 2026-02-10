import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => {
  const isDev = command === "serve";
  const appBase = isDev ? "/" : "/sucks-less-app-portal/";
  const escapedBase = appBase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

  return {
    base: appBase,
    resolve: {
      alias: {
        "@slap/sdk": new URL("../../packages/sdk/src/index.ts", import.meta.url).pathname,
        "@slap/ui": new URL("../../packages/ui/src/index.tsx", import.meta.url).pathname,
        "@slap/calculator": new URL("../calculator/src/index.tsx", import.meta.url).pathname,
        "@slap/journal": new URL("../journal/src/index.tsx", import.meta.url).pathname,
        "@slap/mh-phq9": new URL("../mh-phq9/src/index.tsx", import.meta.url).pathname,
        "@slap/mh-gad7": new URL("../mh-gad7/src/index.tsx", import.meta.url).pathname,
        "@slap/mh-abc": new URL("../mh-abc/src/index.tsx", import.meta.url).pathname,
        "@slap/box-breathing": new URL("../box-breathing/src/index.tsx", import.meta.url).pathname,
        "@slap/audio-recorder": new URL("../audio-recorder/src/index.tsx", import.meta.url).pathname,
        "@slap/calendar": new URL("../calendar/src/index.tsx", import.meta.url).pathname,
        "@slap/daily-checklist": new URL("../daily-checklist/src/index.tsx", import.meta.url).pathname,
        "@slap/emoji-comic-maker": new URL("../emoji-comic-maker/src/index.tsx", import.meta.url).pathname,
        "@slap/game-2048": new URL("../game-2048/src/index.tsx", import.meta.url).pathname,
        "@slap/minesweeper": new URL("../minesweeper/src/index.tsx", import.meta.url).pathname,
        "@slap/ski-free": new URL("../ski-free/src/index.tsx", import.meta.url).pathname,
        "@slap/simon-says": new URL("../simon-says/src/index.tsx", import.meta.url).pathname,
        "@slap/dice-roller": new URL("../dice-roller/src/index.tsx", import.meta.url).pathname,
        "@slap/compass": new URL("../compass/src/index.tsx", import.meta.url).pathname,
        "@slap/countdown": new URL("../countdown/src/index.tsx", import.meta.url).pathname,
        "@slap/stopwatch": new URL("../stopwatch/src/index.tsx", import.meta.url).pathname,
        "@slap/minute-timer": new URL("../minute-timer/src/index.tsx", import.meta.url).pathname,
        "@slap/mastermind": new URL("../mastermind/src/index.tsx", import.meta.url).pathname,
        "@slap/sudoku": new URL("../sudoku/src/index.tsx", import.meta.url).pathname,
        "@slap/fireplace": new URL("../fireplace/src/index.tsx", import.meta.url).pathname,
        "@slap/aquarium": new URL("../aquarium/src/index.tsx", import.meta.url).pathname,
        "@slap/zen-garden": new URL("../zen-garden/src/index.tsx", import.meta.url).pathname,
        "@slap/whiteboard": new URL("../whiteboard/src/index.tsx", import.meta.url).pathname,
        "@slap/notes": new URL("../notes/src/index.tsx", import.meta.url).pathname
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        devOptions: {
          enabled: true
        },
        workbox: {
          navigateFallbackDenylist: [new RegExp(`^${escapedBase}apps/`)]
        },
        includeAssets: [
          "favicon.svg",
          "icon-192.png",
          "icon-512.png",
          "icon-512-maskable.png",
          "screenshot-mobile.png",
          "screenshot-wide.png"
        ],
        manifest: {
          id: appBase,
          name: "sucks-less app portal",
          short_name: "sucks-less",
          description: "Offline-first launcher for small local apps.",
          theme_color: "#2d4030",
          background_color: "#f4f0e8",
          display: "standalone",
          start_url: appBase,
          scope: appBase,
          icons: [
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ],
          screenshots: [
            {
              src: "screenshot-mobile.png",
              sizes: "540x720",
              type: "image/png"
            },
            {
              src: "screenshot-wide.png",
              sizes: "1280x720",
              type: "image/png",
              form_factor: "wide"
            }
          ]
        }
      })
    ]
  };
});
