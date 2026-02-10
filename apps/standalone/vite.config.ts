import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const resolvePath = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig(({ command }) => {
  const appId = process.env.APP_ID ?? "sucks-less-app";
  const appEntry = process.env.APP_ENTRY ?? "";
  const appExport = process.env.APP_EXPORT ?? "";
  const appTitle = process.env.APP_TITLE ?? "sucks-less app";
  const appShort = process.env.APP_SHORT ?? appTitle;
  const appDescription = process.env.APP_DESCRIPTION ?? "";

  const base = command === "serve" ? "/" : `/sucks-less-app-portal/apps/${appId}/`;

  return {
    root: resolvePath("."),
    base,
    publicDir: resolvePath("../launcher/public"),
    resolve: {
      alias: {
        "@slap/sdk": resolvePath("../../packages/sdk/src/index.ts"),
        "@slap/ui": resolvePath("../../packages/ui/src/index.tsx")
      }
    },
    define: {
      __APP_ENTRY__: JSON.stringify(appEntry),
      __APP_EXPORT__: JSON.stringify(appExport),
      __APP_TITLE__: JSON.stringify(appTitle),
      __APP_SHORT__: JSON.stringify(appShort),
      __APP_DESCRIPTION__: JSON.stringify(appDescription)
    },
    build: {
      outDir: resolvePath(`../../docs/apps/${appId}`),
      emptyOutDir: true
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: [
          "favicon.svg",
          "icon-192.png",
          "icon-512.png",
          "icon-512-maskable.png",
          "screenshot-mobile.png",
          "screenshot-wide.png"
        ],
        manifest: {
          id: base,
          name: appTitle,
          short_name: appShort,
          description: appDescription,
          theme_color: "#2d4030",
          background_color: "#f4f0e8",
          display: "standalone",
          start_url: base,
          scope: base,
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
