import { Badge, Icon } from "./components"
import type { Request } from "./data"
import {
  allocationFor,
  isActive,
  isVerified,
  needs,
  unallocated,
  type Operations,
} from "./operations"
import {
  affectedAreas,
  areaSummary,
  centerInventory,
  distributionCenters,
  shelterCapacity,
  shelters,
  type MapSelection,
} from "./mapModel"

export default function MapContext({
  selection,
  state,
  onRequest,
  onDetails,
  onWorkflow,
  onInventory,
}: {
  selection: MapSelection
  state: Operations
  onRequest: (r: Request) => void
  onDetails: (r: Request) => void
  onWorkflow: (r: Request) => void
  onInventory: (resource: string) => void
}) {
  if (selection.kind === "request") {
    const r = state.requests.find((r) => r.id === selection.id)
    if (!r) return null
    const stock = state.stock.find((s) => s.name === r.resource)!
    const a = allocationFor(state, r.id)
    const gap = needs(state).find((n) => n.r.id === r.id)?.missing || 0
    return (
      <>
        <div className="popup-top">
          <strong>{r.id}</strong>
          <Badge tone={r.priority}>{r.priority}</Badge>
        </div>
        <h3 className="popup-resource">{r.resource}</h3>
        <p>
          <Icon name="pin" size={12} />
          {r.zone} · {r.people} people affected
        </p>
        <dl className="map-context-values">
          {[
            ["Required", `${r.quantity} ${stock.unit}`],
            ["Confirmed", a?.quantity || 0],
            ["Unallocated", unallocated(state, r)],
            ["Stock available", `${stock.available} ${stock.unit}`],
            ["Stock gap", gap],
            ["Delivered", a?.fulfilledQuantity || 0],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="popup-bottom">
          <Badge tone={r.status}>{r.status}</Badge>
          <button className="text-link" onClick={() => onDetails(r)}>
            View full details
            <Icon name="arrow" size={13} />
          </button>
        </div>
        {isActive(r) && (
          <button
            className="button secondary map-next-action"
            onClick={() => (isVerified(r) ? onWorkflow(r) : onDetails(r))}
          >
            {isVerified(r)
              ? "Open allocation & dispatch"
              : "Review verification"}
            <Icon name="arrow" size={13} />
          </button>
        )}
      </>
    )
  }
  if (selection.kind === "center") {
    const center = distributionCenters.find((c) => c.id === selection.id)!
    const inventory = centerInventory(center, state.stock)
    return (
      <>
        <div className="popup-top">
          <strong>{center.id}</strong>
          <Badge>Distribution center</Badge>
        </div>
        <h3 className="popup-resource">{center.name}</h3>
        <p>
          <Icon name="pin" size={12} />
          {center.location} · {center.zone}
        </p>
        <dl className="map-context-values">
          {[
            ["Total stock", inventory.total],
            ["Allocated", inventory.allocated],
            ["Available", inventory.available],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label} (units)</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>Stored: {inventory.rows.map((s) => s.name).join(", ")}</p>
        <p className={inventory.low.length ? "amber-text" : ""}>
          {inventory.low.length
            ? `Low stock: ${inventory.low.map((s) => s.name).join(", ")} (≤20% storage capacity)`
            : "No low-stock warnings."}
        </p>
        <button
          className="button secondary map-next-action"
          onClick={() => onInventory(center.resources[0])}
        >
          View center inventory
          <Icon name="box" size={14} />
        </button>
        <p className="map-context-note">
          Illustrative location · totals exclude unavailable storage capacity.
        </p>
      </>
    )
  }
  if (selection.kind === "shelter") {
    const shelter = shelters.find((s) => s.id === selection.id)!
    const capacity = shelterCapacity(shelter, state)
    return (
      <>
        <div className="popup-top">
          <strong>{shelter.id}</strong>
          <Badge>Shelter</Badge>
        </div>
        <h3 className="popup-resource">{shelter.name}</h3>
        <p>
          <Icon name="pin" size={12} />
          {shelter.location}
        </p>
        <dl className="map-context-values">
          {[
            ["Total capacity", capacity.capacity],
            ["Current occupancy", capacity.occupied],
            ["Unoccupied", capacity.remaining],
            ["Reserved / en route", capacity.reserved],
            ["Available spaces", capacity.available],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Badge tone={capacity.available ? "verified" : "Awaiting Resources"}>
          {capacity.status}
        </Badge>
        <button
          className="button secondary map-next-action"
          onClick={() => onInventory(shelter.stockName)}
        >
          View shelter inventory
          <Icon name="arrow" size={14} />
        </button>
        <p className="map-context-note">
          People, not resource units. Occupancy advances only on confirmed
          delivery. Illustrative data.
        </p>
      </>
    )
  }
  const area = affectedAreas(state.requests).find((a) => a.id === selection.id)
  if (!area) return null
  const summary = areaSummary(area, state)
  return (
    <>
      <div className="popup-top">
        <strong>{area.name}</strong>
        <Badge>Affected area</Badge>
      </div>
      <p>Illustrative extent · not a verified boundary</p>
      <dl className="map-context-values">
        {[
          ["Associated requests", summary.requests.length],
          ["Reported people", summary.people],
          ["Active critical", summary.critical],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={summary.unmet.length ? "amber-text" : ""}>
        Unmet resources: {summary.unmet.join(", ") || "No current stock gaps"}
      </p>
      <div className="area-request-links">
        {summary.requests.map((r) => (
          <button key={r.id} className="text-link" onClick={() => onRequest(r)}>
            {r.id} · {r.resource}
            <Badge tone={r.priority}>{r.priority}</Badge>
          </button>
        ))}
      </div>
      <p className="map-context-note">
        Area totals include all associated records, not just filtered markers.
        People are summed from active requests and may overlap.
      </p>
    </>
  )
}
