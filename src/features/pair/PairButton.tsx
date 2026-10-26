import { lazy, Suspense } from "react"
import { UsersRoundIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { partnerLabel, usePair } from "./pairStore"
import { formatRoomCode } from "./roomCode"

// The dialog (and its QR encoder) loads on first open.
const PairDialog = lazy(() => import("./PairDialog").then((m) => ({ default: m.PairDialog })))

const DOT: Record<string, string> = {
  connected: "bg-emerald-500",
  waiting: "bg-amber-500",
  reconnecting: "bg-amber-500 motion-safe:animate-pulse",
  error: "bg-destructive",
}

/** Header entry point for the shared booth, showing its state at a glance. */
export function PairButton({ disabled }: { disabled?: boolean }) {
  const state = usePair(
    useShallow((s) => ({
      status: s.status,
      code: s.code,
      partner: s.partner,
      partnerName: s.partnerName,
      dialogLoaded: s.dialogLoaded,
    }))
  )
  const open = () => usePair.getState().setDialogOpen(true)

  const label =
    state.status === "connected"
      ? `Shared booth with ${partnerLabel(state)}`
      : state.status === "reconnecting"
        ? `Reconnecting to ${partnerLabel(state)}`
        : state.status === "waiting" && state.code
          ? `Shared booth open, code ${formatRoomCode(state.code)}`
          : "Shoot together"
  const text =
    state.status === "connected" || state.status === "reconnecting"
      ? partnerLabel(state)
      : state.status === "waiting" && state.code
        ? formatRoomCode(state.code)
        : null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state.status === "off" ? "ghost" : "secondary"}
            size={text ? "default" : "icon"}
            aria-label={label}
            disabled={disabled}
            onClick={open}
            className={cn("relative", text && "max-w-40")}
          >
            {state.status === "connecting" ? <Spinner /> : <UsersRoundIcon />}
            {text && <span className={cn("truncate max-sm:hidden", state.status === "waiting" && "font-mono")}>{text}</span>}
            {DOT[state.status] && (
              <span
                aria-hidden="true"
                className={cn("absolute top-1 right-1 size-2 rounded-full ring-2 ring-background", DOT[state.status])}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {state.dialogLoaded && (
        <Suspense fallback={null}>
          <PairDialog />
        </Suspense>
      )}
    </>
  )
}
