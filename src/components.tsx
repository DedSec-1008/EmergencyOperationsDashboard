import { useEffect, useRef, type ReactNode } from "react"
import type { Request } from "./data"

export function Icon({
  name = "grid",
  size = 20,
}: {
  name?: string
  size?: number
}) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16" />
        <circle cx="15" cy="9" r="2" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H5v18h14V8Z M14 3v5h5 M8 12h8 M8 16h6" />
      </>
    ),
    box: (
      <>
        <path d="m3 7 9-4 9 4v10l-9 4-9-4Z M3 7l9 4 9-4 M12 11v10 M7 5l10 4" />
      </>
    ),
    truck: (
      <>
        <path d="M3 5h12v12H3Z M15 9h4l3 4v4h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2Z M12 9v5 M12 17h.01" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v18h17 M8 15v-4 M13 15V7 M18 15v-8" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    bell: (
      <>
        <path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4Z M10 20h4" />
      </>
    ),
    arrow: <path d="M4 12h16 M15 7l5 5-5 5" />,
    plus: <path d="M12 5v14 M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12 M6 18 18 6" />,
    water: (
      <>
        <path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z M8 15a4 4 0 0 0 4 4" />
      </>
    ),
    food: (
      <>
        <path d="M5 3v7a3 3 0 0 0 6 0V3 M8 3v18 M19 3c-4 4-4 9 0 9v9 M19 3v9" />
      </>
    ),
    medical: (
      <>
        <rect x="3" y="6" width="18" height="15" rx="2" />
        <path d="M8 6V3h8v3 M12 10v7 M8.5 13.5h7" />
      </>
    ),
    shelter: (
      <>
        <path d="m2 11 10-8 10 8 M5 9v12h14V9 M9 21v-8h6v8" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z M20 2v4 M18 4h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    menu: <path d="M3 6h18 M3 12h18 M3 18h18" />,
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8Z M2 12l10 5 10-5 M2 16l10 5 10-5" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  )
}
export const resourceIcon = (name: string) =>
  name === "Drinking Water"
    ? "water"
    : name === "Food Kits"
      ? "food"
      : name === "Medical Supplies"
        ? "medical"
        : "shelter"
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode
  tone?: string
}) {
  return (
    <span className={`badge ${tone.toLowerCase().replace(/ /g, "-")}`}>
      {children}
    </span>
  )
}
export function RequestTable({
  requests,
  onSelect,
  onDetails,
  selectedId,
  syncScroll = false,
}: {
  requests: Request[]
  onSelect: (r: Request) => void
  onDetails?: (r: Request) => void
  selectedId?: string
  syncScroll?: boolean
}) {
  const tableRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!syncScroll || !selectedId) return
    const container = tableRef.current!
    const row = Array.from(
      container.querySelectorAll<HTMLTableRowElement>("tr[data-request-id]"),
    ).find((row) => row.dataset.requestId === selectedId)
    if (!row) return
    const parentRect = container.getBoundingClientRect(),
      rowRect = row.getBoundingClientRect()
    const visibleTop =
      parentRect.top +
      (container.querySelector("thead")?.getBoundingClientRect().height || 0)
    if (rowRect.top < visibleTop)
      container.scrollTop -= visibleTop - rowRect.top
    else if (rowRect.bottom > parentRect.bottom)
      container.scrollTop += rowRect.bottom - parentRect.bottom
  }, [selectedId, requests.length, syncScroll])
  return (
    <div className="table-wrap" ref={tableRef}>
      <table>
        <thead>
          <tr>
            {[
              "Request ID",
              "Resource needed",
              "Location",
              "Priority",
              "Quantity",
              "People",
              "Received",
              "Status",
              "",
            ].map((x, i) => (
              <th key={i}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              data-request-id={r.id}
              aria-selected={r.id === selectedId}
              className={`${
                r.priority === "Critical" &&
                !["Rejected", "Cancelled", "Fulfilled"].includes(r.status)
                  ? "critical-row"
                  : ""
              } ${r.id === selectedId ? "selected-request-row" : ""}`}
            >
              <td>
                <button
                  className="text-link request-id"
                  aria-pressed={r.id === selectedId}
                  onClick={() => onSelect(r)}
                >
                  {r.id}
                </button>
              </td>
              <td>
                <span className="resource-cell">
                  <Icon name={resourceIcon(r.resource)} size={15} />
                  {r.resource}
                </span>
              </td>
              <td>{r.zone}</td>
              <td>
                <Badge tone={r.priority}>
                  <span className="dot" />
                  {r.priority}
                </Badge>
              </td>
              <td className="quantity-cell">
                {r.quantity}{" "}
                <span className="muted">
                  {r.resource === "Temporary Shelter" ? "spaces" : "units"}
                </span>
              </td>
              <td>{r.people}</td>
              <td className="muted">{r.time}</td>
              <td>
                <Badge tone={r.status}>{r.status}</Badge>
              </td>
              <td>
                <button
                  className="icon-button row-arrow"
                  aria-label={`View ${r.id}`}
                  onClick={() => (onDetails || onSelect)(r)}
                >
                  <Icon name="arrow" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!requests.length && (
        <div className="empty">No requests match these filters.</div>
      )}
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
  drawer = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  drawer?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    const el = ref.current!
    const focusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ).filter((e) => !e.hasAttribute("disabled"))
    focusable()[0]?.focus()
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== el) return
      if (e.key === "Escape") close.current()
      if (e.key === "Tab") {
        const items = focusable()
        const first = items[0]
        const last = items.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener("keydown", handler)
    const old = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handler)
      document.body.style.overflow = old
      previous?.focus()
    }
  }, [])
  return (
    <div
      className={`overlay ${drawer ? "drawer-overlay" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className={`modal ${drawer ? "drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
