import { Badge, Icon } from "./components"
import { type Request } from "./data"
import {
  allocationFor,
  isActive,
  isVerified,
  needs,
  priorityActions,
  priorityRank,
  unallocated,
  type Command,
  type Operations,
} from "./operations"

export function PriorityActions({
  state,
  onRequest,
  onWorkflow,
  onInventory,
  onNeeds,
}: {
  state: Operations
  onRequest: (r: Request) => void
  onWorkflow: (r: Request) => void
  onInventory: (resource: string) => void
  onNeeds: (r: Request) => void
}) {
  const actions = priorityActions(state)
  return (
    <section className="panel intelligence-panel priority-actions">
      <div className="panel-heading">
        <div className="heading-with-icon">
          <Icon name="alert" size={18} />
          <h2>Priority Actions</h2>
        </div>
        <span className="count-chip">{actions.length}</span>
      </div>
      <p className="ai-subtitle">
        Derived from session data · coordinator action required
      </p>
      <div className="recommendations">
        {actions.map((a) => (
          <article
            className={`recommendation ${
              a.priority === "Critical" ? "action-critical" : "teal"
            }`}
            key={a.id}
          >
            <div className="action-heading">
              <Badge tone={a.priority}>{a.priority}</Badge>
              <h3>{a.title}</h3>
            </div>
            <p>{a.text}</p>
            <button
              className="text-link"
              onClick={() =>
                a.inventory
                  ? onInventory(a.inventory)
                  : a.id.startsWith("review")
                    ? onRequest(a.request!)
                    : a.id.startsWith("shortage")
                      ? onNeeds(a.request!)
                      : onWorkflow(a.request!)
              }
            >
              {a.action}
              <Icon name="arrow" size={14} />
            </button>
          </article>
        ))}
        {!actions.length && (
          <div className="empty">No pending coordination actions.</div>
        )}
      </div>
      <div className="ai-footnote">
        Rule-based prototype guidance · not live AI
      </div>
    </section>
  )
}
export function AllocationBoard({
  state,
  onAllocate,
  onRequest,
  onConfirm,
  focused,
}: {
  state: Operations
  onAllocate: (r: Request) => void
  onRequest: (r: Request) => void
  onConfirm: (command: Command, title: string, text: string) => void
  focused: string
}) {
  return (
    <>
      <div className="callout small">
        <Icon name="truck" />
        <p>
          Manual prototype records only. Teams are illustrative; no GPS,
          responder tracking, or emergency-service integration.
        </p>
      </div>
      <div className="allocation-list">
        {state.requests
          .slice()
          .sort((a, b) =>
            a.id === focused
              ? -1
              : b.id === focused
                ? 1
                : priorityRank(a) - priorityRank(b),
          )
          .map((r) => {
            const s = state.stock.find((s) => s.name === r.resource)!
            const a = allocationFor(state, r.id)
            const remaining = unallocated(state, r)
            const proposed =
              isActive(r) && isVerified(r)
                ? Math.min(remaining, s.available)
                : 0
            const awaiting = (a?.quantity || 0) - (a?.dispatchedQuantity || 0)
            const inTransit =
              (a?.dispatchedQuantity || 0) - (a?.fulfilledQuantity || 0)
            return (
              <section
                className={`panel allocation-card ${
                  a ? "confirmed" : "recommended"
                } ${r.id === focused ? "focused-request" : ""}`}
                key={r.id}
              >
                <div className="allocation-card-head">
                  <Badge tone={r.priority}>{r.priority}</Badge>
                  <button className="text-link" onClick={() => onRequest(r)}>
                    {r.id} · {r.zone}
                  </button>
                  <Badge tone={r.status}>{r.status}</Badge>
                </div>
                <h2>{r.resource}</h2>
                <p>
                  {r.people} people affected ·{" "}
                  {s.unit === "people" ? "Shelter spaces" : "Resource units"}
                </p>
                <div className="allocation-values">
                  {[
                    ["Required", r.quantity],
                    ["Available stock", s.available],
                    ["Proposed · not reserved", proposed],
                    ["Confirmed total", a?.quantity || 0],
                    ["Stock after proposal", s.available - proposed],
                    ["Unallocated", remaining],
                    ["Awaiting dispatch", awaiting],
                    ["Unfulfilled", r.quantity - (a?.fulfilledQuantity || 0)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                {remaining > s.available && isActive(r) && (
                  <p className="shortage-note">
                    <Icon name="alert" size={15} />
                    Stock gap: {remaining - s.available} {s.unit}. At most{" "}
                    {proposed} can be proposed now
                    {!isVerified(r) ? "; verification required" : ""}.
                  </p>
                )}
                <p className="helper">
                  {a
                    ? `Assigned team: ${a.team} · ${a.dispatchedQuantity} dispatched · ${a.fulfilledQuantity} delivered`
                    : "No team assigned. Proposed quantities are not confirmed allocations."}
                </p>
                <div className="workflow-buttons">
                  {isActive(r) &&
                    remaining > 0 &&
                    (isVerified(r) ? (
                      <button
                        className="button secondary"
                        disabled={!proposed}
                        onClick={() => onAllocate(r)}
                      >
                        {proposed ? "Review allocation" : "Awaiting stock"}
                        <Icon name="arrow" size={15} />
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() => onRequest(r)}
                      >
                        Review & verify request
                      </button>
                    ))}
                  {awaiting > 0 && (
                    <button
                      className="button primary"
                      onClick={() =>
                        onConfirm(
                          {
                            type: "dispatch",
                            id: r.id,
                            expectedQuantity: awaiting,
                          },
                          "Confirm dispatch",
                          `Record manual dispatch of ${awaiting} ${s.unit} for ${r.id} with ${a!.team}? This does not track a real team.`,
                        )
                      }
                    >
                      Confirm dispatch
                    </button>
                  )}
                  {inTransit > 0 && (
                    <button
                      className="button primary"
                      onClick={() =>
                        onConfirm(
                          {
                            type: "fulfill",
                            id: r.id,
                            expectedQuantity: inTransit,
                          },
                          "Confirm delivery",
                          `Confirm ${inTransit} ${s.unit} delivered for ${r.id}? Only delivered quantities count toward fulfillment.`,
                        )
                      }
                    >
                      Confirm delivery
                    </button>
                  )}
                </div>
                {!isActive(r) && (
                  <p className="helper">Closed request · {r.status}</p>
                )}
              </section>
            )
          })}
      </div>
    </>
  )
}
export function UnmetNeeds({
  state,
  onRequest,
  onInventory,
  focused,
}: {
  state: Operations
  onRequest: (r: Request) => void
  onInventory: (resource: string) => void
  focused: string
}) {
  const rows = needs(state).sort((a, b) =>
    a.r.id === focused
      ? -1
      : b.r.id === focused
        ? 1
        : priorityRank(a.r) - priorityRank(b.r),
  )
  return (
    <>
      <div className="callout">
        <Icon name="alert" />
        <div>
          <strong>
            {rows.length} needs have incomplete allocation ·{" "}
            {rows.filter((n) => n.missing > 0).length} stock gaps
          </strong>
          <p>
            Stock coverage is indicative, shared once per category in priority
            order. It is not reserved until confirmed. Closed requests are
            excluded.
          </p>
        </div>
      </div>
      <div className="allocation-list">
        {rows.map((n) => (
          <section
            className={`panel unmet-card ${
              n.r.id === focused ? "focused-request" : ""
            }`}
            key={n.r.id}
          >
            <div className="action-heading">
              <Badge tone={n.r.priority}>{n.r.priority}</Badge>
              <Badge tone={n.r.status}>{n.r.status}</Badge>
            </div>
            <h2>{n.r.resource}</h2>
            <p>
              {n.r.id} · {n.r.zone} · {n.r.people} people affected
            </p>
            <div className="allocation-values">
              {[
                ["Required", n.r.quantity],
                ["Unallocated", n.remaining],
                ["Available stock", n.s.available],
                ["Priority coverage", n.available],
                ["Missing stock", n.missing],
                [
                  "Unfulfilled",
                  n.r.quantity -
                    (allocationFor(state, n.r.id)?.fulfilledQuantity || 0),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong
                    className={
                      label === "Missing stock" && n.missing ? "amber-text" : ""
                    }
                  >
                    {value}
                  </strong>
                  <span>
                    {label} ({n.s.unit})
                  </span>
                </div>
              ))}
            </div>
            <p className="helper">
              {n.missing
                ? "Insufficient stock for full remaining demand."
                : "Stock can cover this need; coordinator allocation is still required."}
            </p>
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => onRequest(n.r)}
              >
                View request
              </button>
              <button
                className="text-link"
                onClick={() => onInventory(n.s.name)}
              >
                Review inventory
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </section>
        ))}
      </div>
      {!rows.length && (
        <div className="empty panel">
          No unallocated active needs. Confirmed deliveries are tracked in
          Allocation & Dispatch.
        </div>
      )}
    </>
  )
}
