import { useEffect, useEffectEvent } from "react"

/** Keys by KeyboardEvent.key, with " " spelled "Space" and letters lowercased. */
export type HotkeyMap = Partial<Record<string, (event: KeyboardEvent) => void>>

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"].includes(target.type)
  }
  return target.closest("[role='slider'], [role='combobox'], [role='listbox']") !== null
}

function overlayOpen(): boolean {
  return (
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='menu'], [role='listbox']"
    ) !== null
  )
}

/** App-wide keyboard shortcuts (Mac). Ignored while typing or when a dialog or menu is open. */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isTypingTarget(event.target) || overlayOpen()) return
    const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toLowerCase() : event.key
    const handler = map[key]
    if (!handler) return
    event.preventDefault()
    handler(event)
  })

  useEffect(() => {
    if (!enabled) return
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [enabled])
}
