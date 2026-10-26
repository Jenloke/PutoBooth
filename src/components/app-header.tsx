import type { ReactNode } from "react"
import { CameraIcon, ImagesIcon } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { PairButton } from "@/features/pair/PairButton"
import { navigate, useRoute } from "@/lib/router"
import { cn } from "@/lib/utils"

type AppHeaderProps = {
  /** Screen-specific actions, rendered before the navigation. */
  actions?: ReactNode
  /** Disables navigation, e.g. while a capture session is running. */
  locked?: boolean
  className?: string
}

export function AppHeader({ actions, locked = false, className }: AppHeaderProps) {
  const route = useRoute()

  return (
    <header
      className={cn(
        "pt-safe shrink-0 border-b bg-background/95 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur",
        className
      )}
    >
      <div className="flex h-14 items-center gap-1 px-3 sm:px-4">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault()
            if (!locked) navigate("/")
          }}
          className="mr-auto flex items-center gap-2 rounded-md px-1 py-1 font-heading text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-disabled={locked || undefined}
        >
          <BrandMark />
          <span>Photobooth</span>
        </a>
        <PairButton disabled={locked} />
        {actions}
        <nav aria-label="Main" className="flex items-center gap-1">
          <Button
            variant={route === "/" ? "secondary" : "ghost"}
            className="hidden sm:inline-flex"
            aria-current={route === "/" ? "page" : undefined}
            disabled={locked}
            onClick={() => navigate("/")}
          >
            <CameraIcon />
            Booth
          </Button>
          <Button
            variant={route === "/gallery" ? "secondary" : "ghost"}
            className="hidden sm:inline-flex"
            aria-current={route === "/gallery" ? "page" : undefined}
            disabled={locked}
            onClick={() => navigate("/gallery")}
          >
            <ImagesIcon />
            Gallery
          </Button>
          {route === "/gallery" ? (
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label="Back to booth"
              onClick={() => navigate("/")}
            >
              <CameraIcon />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label="Gallery"
              disabled={locked}
              onClick={() => navigate("/gallery")}
            >
              <ImagesIcon />
            </Button>
          )}
        </nav>
        <ModeToggle />
      </div>
    </header>
  )
}
