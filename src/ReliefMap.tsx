import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type CSSProperties,
} from "react"
import { Icon } from "./components"
import { requestStatuses, type Request } from "./data"
import { isActive, needs, type Operations } from "./operations"
import {
  affectedAreas,
  clampPan,
  defaultMapFilters,
  defaultMapLayers,
  distributionCenters,
  matchesMapFilters,
  requestPoint,
  shelters,
  type MapFilters,
  type MapLayers,
  type MapPoint,
  type MapSelection,
} from "./mapModel"
import MapTerrain from "./MapTerrain"
import MapContext from "./MapContext"

export default function ReliefMap({
  state,
  selection,
  onSelection,
  filters,
  onFilters,
  layers,
  onLayers,
  onRequest,
  onDetails,
  onWorkflow,
  onInventory,
  large = false,
}: {
  state: Operations
  selection: MapSelection
  onSelection: (selection: MapSelection) => void
  filters: MapFilters
  onFilters: (filters: MapFilters) => void
  layers: MapLayers
  onLayers: (layers: MapLayers) => void
  onRequest: (r: Request) => void
  onDetails: (r: Request) => void
  onWorkflow: (r: Request) => void
  onInventory: (resource: string) => void
  large?: boolean
}) {
  const { requests, stock } = state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<MapPoint>({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 800, height: 400 })
  const [dragging, setDragging] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    x: number
    y: number
    pan: MapPoint
  } | null>(null)
  const context = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(280)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => setCollapsed(false), [selection])
  const inViewport = (p: MapPoint) => {
    const x =
        ((size.width * p.x) / 100) * zoom +
        (size.width * (1 - zoom)) / 2 +
        pan.x,
      y =
        ((size.height * p.y) / 100) * zoom +
        (size.height * (1 - zoom)) / 2 +
        pan.y
    return x >= 0 && x <= size.width && y >= 0 && y <= size.height
  }
  const filtered = requests.filter((r) => matchesMapFilters(r, filters))
  const areas = affectedAreas(requests)
  const visibleAreas = layers.areas
    ? areas.filter((a) => filtered.some((r) => r.zone === a.zone))
    : []
  const visibleCenters = layers.centers
    ? distributionCenters.filter(
        (c) =>
          (filters.resource === "All resources" ||
            c.resources.includes(filters.resource)) &&
          (filters.location === "All locations" || c.zone === filters.location),
      )
    : []
  const visibleShelters = layers.shelters
    ? shelters.filter(
        (s) =>
          (filters.resource === "All resources" ||
            filters.resource === s.stockName) &&
          (filters.location === "All locations" || s.zone === filters.location),
      )
    : []
  const visibleRequests = layers.requests ? filtered : []
  const visibleCritical = visibleRequests.filter(
    (r) =>
      r.priority === "Critical" && isActive(r) && inViewport(requestPoint(r)),
  ).length
  const totalCritical = requests.filter(
    (r) => r.priority === "Critical" && isActive(r),
  ).length
  const gaps = needs(state).filter((n) => n.missing > 0)
  const visibleGaps = gaps.filter((n) =>
    visibleRequests.some((r) => r.id === n.r.id),
  )
  const markerCount =
    visibleRequests.length +
    visibleCenters.length +
    visibleShelters.length +
    visibleAreas.length
  const point =
    selection.kind === "request"
      ? requestPoint(requests.find((r) => r.id === selection.id) || requests[0])
      : selection.kind === "center"
        ? distributionCenters.find((c) => c.id === selection.id)!.point
        : selection.kind === "shelter"
          ? shelters.find((s) => s.id === selection.id)!.point
          : areas.find((a) => a.id === selection.id)?.point || { x: 50, y: 50 }
  const selectedVisible =
    selection.kind === "request"
      ? visibleRequests.some((r) => r.id === selection.id)
      : selection.kind === "center"
        ? visibleCenters.some((c) => c.id === selection.id)
        : selection.kind === "shelter"
          ? visibleShelters.some((s) => s.id === selection.id)
          : visibleAreas.some((a) => a.id === selection.id)
  const screenPoint = {
    x:
      ((size.width * point.x) / 100) * zoom +
      (size.width * (1 - zoom)) / 2 +
      pan.x,
    y:
      ((size.height * point.y) / 100) * zoom +
      (size.height * (1 - zoom)) / 2 +
      pan.y,
  }
  const cardWidth = Math.min(260, size.width - 24)
  const cardLeft = Math.max(
    12,
    Math.min(
      size.width - cardWidth - 12,
      screenPoint.x > size.width * 0.6
        ? screenPoint.x - cardWidth - 22
        : screenPoint.x + 22,
    ),
  )
  const cardTop = Math.max(
    10,
    Math.min(
      size.height - Math.min(cardHeight, size.height - 20) - 10,
      screenPoint.y - 65,
    ),
  )

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(surface.current!)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!context.current) return
    const observer = new ResizeObserver(() =>
      setCardHeight(context.current!.getBoundingClientRect().height),
    )
    observer.observe(context.current)
    return () => observer.disconnect()
  }, [])
  useEffect(
    () => setPan((p) => clampPan(p, zoom, size.width, size.height)),
    [zoom, size.width, size.height],
  )
  useEffect(() => {
    // Keep a queue-selected point in view without changing the shared selection.
    setPan((p) => {
      const x =
        ((size.width * point.x) / 100) * zoom +
        (size.width * (1 - zoom)) / 2 +
        p.x
      const y =
        ((size.height * point.y) / 100) * zoom +
        (size.height * (1 - zoom)) / 2 +
        p.y
      if (x < 45 || x > size.width - 45 || y < 40 || y > size.height - 40)
        return clampPan(
          {
            x: size.width * zoom * (0.5 - point.x / 100),
            y: size.height * zoom * (0.5 - point.y / 100),
          },
          zoom,
          size.width,
          size.height,
        )
      return p
    })
  }, [selection, zoom, size.width, size.height, point.x, point.y])
  function reset() {
    onFilters({ ...defaultMapFilters })
    onLayers({ ...defaultMapLayers })
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest("button,select,input,a")
    )
      return
    drag.current = { x: e.clientX, y: e.clientY, pan }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setPan(
      clampPan(
        {
          x: drag.current.pan.x + e.clientX - drag.current.x,
          y: drag.current.pan.y + e.clientY - drag.current.y,
        },
        zoom,
        size.width,
        size.height,
      ),
    )
  }
  function stopDrag() {
    drag.current = null
    setDragging(false)
  }
  function reveal() {
    onFilters({ ...defaultMapFilters })
    onLayers({
      ...layers,
      [selection.kind === "request"
        ? "requests"
        : selection.kind === "center"
          ? "centers"
          : selection.kind === "shelter"
            ? "shelters"
            : "areas"]: true,
    })
  }
  const activeFilters = Object.entries(filters)
    .filter(([, v]) => !v.startsWith("All "))
    .map(([, v]) => v)
  const hiddenLayers = Object.entries(layers)
    .filter(([, v]) => !v)
    .map(([key]) => key)
  return (
    <section
      className={`panel map-panel interactive-map ${large ? "large-map" : ""}`}
    >
      <div className="panel-heading">
        <div className="heading-with-icon">
          <Icon name="map" size={18} />
          <h2>Relief Operations Map</h2>
          <span className="live-label">Illustrative workspace</span>
        </div>
        <div className="map-header-actions">
          <details className="layer-picker">
            <summary>
              <Icon name="layers" size={16} />
              Layers
            </summary>
            <div className="layer-options">
              {([
                ["requests", "Relief requests"],
                ["centers", "Distribution centers"],
                ["shelters", "Shelters"],
                ["areas", "Affected areas"],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    aria-label={`${label} layer`}
                    checked={layers[key]}
                    onChange={(e) =>
                      onLayers({ ...layers, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <button
            className="text-link map-reset"
            aria-label="Reset map view"
            onClick={reset}
          >
            Reset view
          </button>
        </div>
      </div>
      <div className="map-toolbar">
        <div className="map-filters">
          <select
            aria-label="Map priority"
            value={filters.priority}
            onChange={(e) =>
              onFilters({ ...filters, priority: e.target.value })
            }
          >
            {["All priorities", "Critical", "High", "Medium", "Low"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
          <select
            aria-label="Map resource"
            value={filters.resource}
            onChange={(e) =>
              onFilters({ ...filters, resource: e.target.value })
            }
          >
            {["All resources", ...stock.map((s) => s.name)].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Map request status"
            value={filters.status}
            onChange={(e) => onFilters({ ...filters, status: e.target.value })}
          >
            {["All statuses", ...requestStatuses].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Map location"
            value={filters.location}
            onChange={(e) =>
              onFilters({ ...filters, location: e.target.value })
            }
          >
            {["All locations", ...new Set(requests.map((r) => r.zone))].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </div>
        <div className="map-filter-summary" role="status">
          <span>
            {activeFilters.length
              ? activeFilters.join(" · ")
              : "All request filters"}
            {hiddenLayers.length
              ? ` · Hidden: ${hiddenLayers.join(", ")}`
              : " · All layers shown"}
          </span>
          {(activeFilters.length > 0 || hiddenLayers.length > 0) && (
            <button className="text-link" onClick={reset}>
              Clear filters & layers
            </button>
          )}
        </div>
      </div>
      <div className="map-intelligence">
        <span>
          <span className="dot" />
          <strong>{visibleCritical}</strong> visible critical / {totalCritical}{" "}
          operation critical
        </span>
        <span>{visibleRequests.length} matching requests</span>
        {visibleGaps.map((n) => (
          <button
            className="shortage-chip"
            key={n.r.id}
            aria-label={`Shortage ${n.r.id}: ${n.missing} ${n.s.unit}`}
            onClick={() => onRequest(n.r)}
          >
            <Icon name="alert" size={12} />
            {n.r.zone} · {n.missing} {n.s.unit} missing
          </button>
        ))}
        {!visibleRequests.length && (
          <span>
            No matching request markers. Facility layers ignore request
            priority/status.
          </span>
        )}
      </div>
      <div className={`map-view-stack ${!markerCount ? "empty-view" : ""}`}>
        <div
          className={`map-surface ${dragging ? "is-dragging" : ""}`}
          ref={surface}
          data-zoomed={zoom > 1}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onLostPointerCapture={stopDrag}
          tabIndex={0}
          role="region"
          aria-label="Illustrative map viewport. Zoom with controls; drag or use arrow keys to pan."
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            const move: Record<string, MapPoint> = {
              ArrowLeft: { x: 45, y: 0 },
              ArrowRight: { x: -45, y: 0 },
              ArrowUp: { x: 0, y: 45 },
              ArrowDown: { x: 0, y: -45 },
            }
            if (move[e.key]) {
              e.preventDefault()
              setPan((p) =>
                clampPan(
                  { x: p.x + move[e.key].x, y: p.y + move[e.key].y },
                  zoom,
                  size.width,
                  size.height,
                ),
              )
            }
          }}
        >
          <div
            className="map-world"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <MapTerrain />
            {visibleAreas.map((area) => (
              <button
                key={area.id}
                className={`affected-area selectable-area ${
                  selection.kind === "area" && selection.id === area.id
                    ? "selected"
                    : ""
                }`}
                style={{ left: `${area.point.x}%`, top: `${area.point.y}%` }}
                aria-label={`Affected area ${area.zone}`}
                aria-pressed={
                  selection.kind === "area" && selection.id === area.id
                }
                onClick={() => onSelection({ kind: "area", id: area.id })}
              >
                <span>{area.zone}</span>
              </button>
            ))}
            {visibleRequests.map((r) => {
              const p = requestPoint(r)
              const gap = gaps.find((n) => n.r.id === r.id)
              return (
                <button
                  key={r.id}
                  className={`map-marker ${r.priority.toLowerCase()} ${
                    selection.kind === "request" && selection.id === r.id
                      ? "selected"
                      : ""
                  } ${!isActive(r) ? "inactive" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  aria-label={`${r.id}, ${r.priority}, ${r.resource}, ${r.status}${
                    gap ? `, shortage ${gap.missing} ${gap.s.unit}` : ""
                  }`}
                  aria-pressed={
                    selection.kind === "request" && selection.id === r.id
                  }
                  onClick={() => onRequest(r)}
                >
                  <Icon
                    name={
                      !isActive(r)
                        ? r.status === "Fulfilled"
                          ? "check"
                          : "close"
                        : r.priority === "Critical"
                          ? "alert"
                          : "pin"
                    }
                    size={16}
                  />
                  {gap && (
                    <span className="marker-shortage" aria-hidden="true">
                      !
                    </span>
                  )}
                </button>
              )
            })}
            {visibleCenters.map((c) => (
              <button
                key={c.id}
                className={`facility center ${
                  selection.kind === "center" && selection.id === c.id
                    ? "selected"
                    : ""
                }`}
                style={{ left: `${c.point.x}%`, top: `${c.point.y}%` }}
                aria-label={`Distribution center ${c.id}: ${c.name}`}
                aria-pressed={
                  selection.kind === "center" && selection.id === c.id
                }
                onClick={() => onSelection({ kind: "center", id: c.id })}
              >
                <Icon name="box" size={17} />
              </button>
            ))}
            {visibleShelters.map((s) => (
              <button
                key={s.id}
                className={`facility shelter ${
                  selection.kind === "shelter" && selection.id === s.id
                    ? "selected"
                    : ""
                }`}
                style={{ left: `${s.point.x}%`, top: `${s.point.y}%` }}
                aria-label={`Shelter ${s.id}: ${s.name}`}
                aria-pressed={
                  selection.kind === "shelter" && selection.id === s.id
                }
                onClick={() => onSelection({ kind: "shelter", id: s.id })}
              >
                <Icon name="shelter" size={17} />
              </button>
            ))}
          </div>
          {!markerCount && (
            <div className="map-empty">
              <Icon name="map" size={24} />
              <strong>No map elements match this view.</strong>
              <p>Change a filter or enable a layer to continue.</p>
              <button className="button secondary" onClick={reset}>
                Reset filters & layers
              </button>
            </div>
          )}
          <div className="map-zoom">
            <button
              aria-label="Zoom in"
              disabled={zoom >= 2.5}
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            >
              +
            </button>
            <output aria-label="Map zoom level">
              {Math.round(zoom * 100)}%
            </output>
            <button
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            >
              −
            </button>
          </div>
          <span className="map-pan-hint">
            {zoom > 1 ? "Drag or use arrow keys to pan" : "Zoom in to pan"} ·
            Schematic positions
          </span>
          <span className="map-notice">
            Illustrative geography · no GPS or live feed
          </span>
        </div>
        <div
          ref={context}
          className="map-context map-popup"
          style={
            {
              "--card-left": `${cardLeft}px`,
              "--card-top": `${cardTop}px`,
              "--card-width": `${cardWidth}px`,
            } as CSSProperties
          }
          role="region"
          aria-label="Map selection details"
        >
          <div className="map-context-tools">
            <span>
              {selection.kind} · {selection.id}
            </span>
            <button
              className="text-link"
              aria-label={
                collapsed ? "Expand map details" : "Minimize map details"
              }
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "Show details" : "Minimize"}
            </button>
          </div>
          {!selectedVisible && (
            <div className="selection-hidden">
              <span>Selected record is hidden by this view.</span>
              <button className="text-link" onClick={reveal}>
                Show selected marker
              </button>
            </div>
          )}
          {!collapsed && (
            <MapContext
              selection={selection}
              state={state}
              onRequest={onRequest}
              onDetails={onDetails}
              onWorkflow={onWorkflow}
              onInventory={onInventory}
            />
          )}
        </div>
      </div>
      <div className="map-legend">
        <span>
          <i className="legend-dot red" />
          Critical request
        </span>
        <span>
          <i className="legend-dot amber" />
          High
        </span>
        <span>
          <i className="legend-dot medium" />
          Medium
        </span>
        <span>
          <i className="legend-dot low" />
          Low
        </span>
        <span>
          <i className="legend-square" />
          Distribution center
        </span>
        <span className="legend-shelter">
          <Icon name="shelter" size={13} />
          Shelter
        </span>
        <span>
          <i className="affected-legend" />
          Affected area
        </span>
        <span className="legend-shortage">
          <Icon name="alert" size={12} />
          Stock gap
        </span>
      </div>
    </section>
  )
}
