import { createPortal } from "react-dom"

type PrintImageProps = {
  /** Object URL of the exported image; already loaded by the preview, so printing is instant. */
  url: string | null
  /** Physical size in inches; null (social layouts) fits the image to the page. */
  size: { width: number; height: number } | null
}

/**
 * The only thing visible when printing (see the print rules in index.css). Rendered while a
 * result is on screen, so Print can call window.print() synchronously from the tap.
 */
export function PrintImage({ url, size }: PrintImageProps) {
  if (!url) return null
  const page = size
    ? `@page { size: ${size.width}in ${size.height}in; margin: 0; }`
    : "@page { margin: 0.25in; }"

  return createPortal(
    <div data-print-root="">
      <style>{page}</style>
      <img
        src={url}
        alt=""
        style={
          size
            ? { display: "block", width: `${size.width}in`, height: `${size.height}in` }
            : { display: "block", maxWidth: "100%", maxHeight: "95vh", margin: "0 auto" }
        }
      />
    </div>,
    document.body
  )
}

export function printNow(): void {
  window.print()
}
