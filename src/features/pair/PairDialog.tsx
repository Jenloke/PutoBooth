import { useId, useState, type FormEvent, type ReactNode } from "react"
import { CheckIcon, CopyIcon, LinkIcon, LogOutIcon, Share2Icon, UsersRoundIcon } from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { deviceName } from "@/lib/platform"
import { useSettings } from "@/store/settings"

import { sideName } from "./copy"
import { partnerLabel, usePair, type PairError, type PairState } from "./pairStore"
import { NAME_MAX_LENGTH, sideOf } from "./protocol"
import { QrCode } from "./QrCode"
import { ROOM_CODE_LENGTH, formatRoomCode, inviteUrl, parseRoomCode } from "./roomCode"

const PRIVACY =
  "Photos and live video go straight between the two devices, encrypted. A connection service only introduces them."

function errorText(error: PairError, state: Pick<PairState, "code" | "partner" | "partnerName">): string {
  switch (error) {
    case "unsupported":
      return "This browser can't connect to another device. Try a current version of Safari or Chrome."
    case "network":
      return "Couldn't reach the connection service. Check your internet connection and try again."
    case "not-found":
      return `There's no open booth with the code ${state.code ? formatRoomCode(state.code) : ""}. Check the code, and keep the app open on the other device.`
    case "busy":
      return "That booth already has two people in it."
    case "version":
      return "The other device is running a different version of the app. Reload the app on both devices and try again."
    case "lost":
      return `The connection to ${partnerLabel(state)} was lost.`
    case "invalid-code":
      return `That isn't a booth code. Codes have ${ROOM_CODE_LENGTH} letters and numbers.`
  }
}

/** Connect two devices into one shared booth: open a room or join one, see who's connected, leave. */
export function PairDialog() {
  const state = usePair(
    useShallow((s) => ({
      status: s.status,
      role: s.role,
      code: s.code,
      error: s.error,
      partner: s.partner,
      partnerName: s.partnerName,
      dialogOpen: s.dialogOpen,
    }))
  )
  const { setDialogOpen, host, join, retry, leave } = usePair.getState()

  let body: ReactNode
  switch (state.status) {
    case "off":
      body = <Start onHost={() => void host()} onJoin={(code) => void join(code)} />
      break
    case "connecting":
      body = (
        <Progress
          title={state.role === "host" ? "Opening a booth…" : `Joining ${state.code ? formatRoomCode(state.code) : "booth"}…`}
          onCancel={leave}
        />
      )
      break
    case "waiting":
      body = <Waiting code={state.code!} onClose={leave} />
      break
    case "connected":
    case "reconnecting":
      body = <Connected state={state} onDone={() => setDialogOpen(false)} onLeave={leave} />
      break
    case "error":
      body = (
        <Failed
          message={errorText(state.error ?? "network", state)}
          canRetry={state.error !== "unsupported" && state.error !== "invalid-code"}
          onRetry={retry}
          onBack={leave}
        />
      )
      break
  }

  return (
    <Dialog open={state.dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">{body}</DialogContent>
    </Dialog>
  )
}

function NameField() {
  const id = useId()
  const displayName = useSettings((s) => s.displayName)
  const update = useSettings((s) => s.update)
  return (
    <Field>
      <FieldLabel htmlFor={id}>Your name</FieldLabel>
      <Input
        id={id}
        value={displayName}
        placeholder={deviceName()}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="nickname"
        onChange={(event) => update({ displayName: event.target.value })}
      />
      <FieldDescription>Shown to the person you shoot with.</FieldDescription>
    </Field>
  )
}

function Start({ onHost, onJoin }: { onHost: () => void; onJoin: (code: string) => void }) {
  const id = useId()
  const [code, setCode] = useState("")
  const valid = parseRoomCode(code) !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) onJoin(code)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Shoot together</DialogTitle>
        <DialogDescription>
          Connect a second phone or computer. The countdown runs on both, each of you fills one half of every
          photo, and you both get the strip.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-5">
        <NameField />
        <Button size="lg" className="h-11" onClick={onHost}>
          <UsersRoundIcon />
          Start a shared booth
        </Button>
        <FieldSeparator className="*:data-[slot=field-separator-content]:bg-popover">or join one</FieldSeparator>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <FieldLabel htmlFor={id}>Booth code</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="K7M-4QD"
              maxLength={ROOM_CODE_LENGTH + 2}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 font-mono text-base tracking-widest uppercase"
            />
            <Button type="submit" size="lg" variant="outline" className="h-11 px-4" disabled={!valid}>
              Join
            </Button>
          </div>
        </form>
      </FieldGroup>
      <p className="text-xs text-muted-foreground">{PRIVACY}</p>
    </>
  )
}

function Progress({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Connecting to the other device</DialogDescription>
      </DialogHeader>
      <div className="grid place-items-center py-8">
        <Spinner className="size-6" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  )
}

function Waiting({ code, onClose }: { code: string; onClose: () => void }) {
  const url = inviteUrl(code)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === "function"

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      toast.error("Couldn't copy the link", { description: url })
    }
  }

  const share = () => {
    navigator.share({ title: "Join my photo booth", text: "Tap to join my photo booth:", url }).catch(() => {
      // Dismissed, or not allowed here: the code and QR are still on screen.
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Your booth is open</DialogTitle>
        <DialogDescription>
          On the other device, scan the code or open the invite link. Or tap Shoot together there and enter the
          code.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4">
        <QrCode value={url} label={`QR code for ${url}`} className="size-44 rounded-lg ring-1 ring-black/10" />
        <p className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums">{formatRoomCode(code)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {canShare && (
            <Button size="lg" onClick={share}>
              <Share2Icon />
              Share invite
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner className="size-3.5" />
          Waiting for someone to join…
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close booth
        </Button>
      </DialogFooter>
    </>
  )
}

function Connected({
  state,
  onDone,
  onLeave,
}: {
  state: Pick<PairState, "status" | "role" | "code" | "partner" | "partnerName">
  onDone: () => void
  onLeave: () => void
}) {
  const name = partnerLabel(state)
  const side = sideOf(state.role ?? "host")
  const reconnecting = state.status === "reconnecting"

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {reconnecting ? (
            <Spinner className="size-4" />
          ) : (
            <span aria-hidden="true" className="size-2.5 rounded-full bg-emerald-500" />
          )}
          {reconnecting ? `Reconnecting to ${name}…` : `Connected with ${name}`}
        </DialogTitle>
        <DialogDescription>
          {reconnecting
            ? "Keep the app open on both devices. Photos you already have are safe."
            : `You're on the ${sideName(side, true)} of every photo (the ${sideName(side, false)} in tall layouts), ${name} on the other side. Either of you can press the shutter; the countdown runs on both screens.`}
        </DialogDescription>
      </DialogHeader>
      {reconnecting && state.role === "host" && state.code && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LinkIcon className="size-4" />
          Booth code <span className="font-mono font-medium text-foreground">{formatRoomCode(state.code)}</span>
        </p>
      )}
      <NameField />
      <p className="text-xs text-muted-foreground">{PRIVACY}</p>
      <DialogFooter>
        <Button variant="destructive" onClick={onLeave}>
          <LogOutIcon />
          Leave
        </Button>
        <Button onClick={onDone}>{reconnecting ? "Close" : "Start shooting"}</Button>
      </DialogFooter>
    </>
  )
}

function Failed({
  message,
  canRetry,
  onRetry,
  onBack,
}: {
  message: string
  canRetry: boolean
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Couldn't connect</DialogTitle>
        <DialogDescription role="alert">{message}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        {canRetry && <Button onClick={onRetry}>Try again</Button>}
      </DialogFooter>
    </>
  )
}
