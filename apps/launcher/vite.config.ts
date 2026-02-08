import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@slap/sdk": new URL("../../packages/sdk/src/index.ts", import.meta.url).pathname,
      "@slap/ui": new URL("../../packages/ui/src/index.tsx", import.meta.url).pathname,
      "@slap/calculator": new URL("../calculator/src/index.tsx", import.meta.url).pathname,
      "@slap/journal": new URL("../journal/src/index.tsx", import.meta.url).pathname
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true
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
        name: "Suck Less App Portal",
        short_name: "SLAP",
        description: "Offline-first launcher for small local apps.",
        theme_color: "#2d4030",
        background_color: "#f4f0e8",
        display: "standalone",
        start_url: ".",
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
});
