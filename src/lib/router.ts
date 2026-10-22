import { useSyncExternalStore } from "react"

/** The app has two screens; review is a state of the booth session, not a URL. */
export type Route = "/" | "/gallery"

const ROUTES: readonly Route[] = ["/", "/gallery"]
const NAVIGATE_EVENT = "photobooth:navigate"

function normalize(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/"
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : "/"
}

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener("popstate", onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

function getRoute(): Route {
  return normalize(window.location.pathname)
}

export function navigate(to: Route, { replace = false } = {}) {
  if (window.location.pathname === to) return
  if (replace) history.replaceState(null, "", to)
  else history.pushState(null, "", to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** Rewrites unknown paths (e.g. a stale bookmark) to the closest known route. */
export function normalizeLocation() {
  const route = getRoute()
  if (window.location.pathname !== route) {
    history.replaceState(null, "", route + window.location.search)
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute)
}
