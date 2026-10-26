/// <reference types="vitest/config" />
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `npm run dev:https`: self-signed HTTPS on the LAN so an iPhone can use the camera.
  const lanHttps = mode === "https"

  return {
    plugins: [
      react(),
      tailwindcss(),
      lanHttps && basicSsl(),
      VitePWA({
        // Never reload on our own: the app shows a "Reload" toast, and never mid-session.
        registerType: "prompt",
        injectRegister: false,
        // Preview deployments sit behind Vercel Authentication; the manifest request must
        // carry the auth cookie for Add to Home Screen to work there.
        useCredentials: true,
        includeAssets: ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "Photobooth",
          short_name: "Photobooth",
          description: "Shoot a timed photo strip with your camera. Photos never leave your device.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "any",
          background_color: "#ffffff",
          theme_color: "#ffffff",
          categories: ["photo", "entertainment"],
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Precache the whole app (fonts included) so it works offline after the first visit.
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
          navigateFallback: "/index.html",
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Libraries change rarely: separate chunks stay cached across deploys, so an
          // update only downloads the app code.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              // The shared booth's libraries load only when someone opens it.
              {
                name: "pair",
                test: /node_modules[\\/](peerjs|peerjs-js-binarypack|webrtc-adapter|sdp|eventemitter3|@msgpack|uqr)[\\/]/,
              },
              { name: "ui", test: /node_modules[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      host: lanHttps ? true : undefined,
      // Tunnels for testing on a phone without deploying (cloudflared / ngrok).
      allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    },
    test: {
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
      environment: "node",
    },
  }
})
