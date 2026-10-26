import { defineConfig, devices } from "@playwright/test"

const PORT = 4173
const PEER_PORT = 9000

// End-to-end tests run against the production build with Chromium's fake camera. The shared
// booth signals through a local PeerServer instead of the PeerJS cloud server, and needs no
// STUN/TURN: both browsers are on this machine.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // A stale service worker could serve an old build between runs.
    serviceWorkers: "block",
    permissions: ["camera"],
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            // Plain host candidates, so two browser contexts find each other over localhost.
            "--disable-features=WebRtcHideLocalIpsWithMdns",
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: `npx peerjs --port ${PEER_PORT}`,
      url: `http://localhost:${PEER_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_PEER_HOST: "localhost",
        VITE_PEER_PORT: String(PEER_PORT),
        VITE_PEER_SECURE: "false",
        VITE_ICE_SERVERS: "[]",
      },
    },
  ],
})
