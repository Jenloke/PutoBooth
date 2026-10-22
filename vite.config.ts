/// <reference types="vitest/config" />
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `npm run dev:https`: self-signed HTTPS on the LAN so an iPhone can use the camera.
  const lanHttps = mode === "https"

  return {
    plugins: [react(), tailwindcss(), lanHttps && basicSsl()],
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
