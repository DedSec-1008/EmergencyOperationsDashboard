import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  initialRequests,
  initialStock,
  navItems,
  type Request,
  type Stock,
  requestStatuses,
} from "./data"
import { Icon, Badge, Modal, RequestTable, resourceIcon } from "./components"
import ReliefMap from "./ReliefMap"
import {
  applyCommand,
  metrics,
  needs,
  priorityActions,
  isActive,
  isVerified,
  transitions,
  unallocated,
  allocationFor,
  priorityRank,
  responseTeams,
  type Operations,
  type Command,
} from "./operations"
import { PriorityActions, AllocationBoard, UnmetNeeds } from "./Workflow"
import {
  defaultMapFilters,
  defaultMapLayers,
  matchesMapFilters,
  type MapSelection,
} from "./mapModel"
const navIcons = [
  "grid",
  "map",
  "file",
  "box",
  "truck",
  "alert",
  "chart",
  "settings",
]
export default function App() {
  const [page, setPage] = useState("Overview")
  const [operations, setOperations] = useState<Operations>({
    requests: initialRequests,
    stock: initialStock,
    allocations: [],
  })
  const operationsRef = useRef(operations)
  const { requests, stock, allocations } = operations
  const [selection, setSelection] = useState<MapSelection>({
    kind: "request",
    id: initialRequests[0].id,
  })
  const [mapFilters, setMapFilters] = useState({ ...defaultMapFilters })
  const [mapLayers, setMapLayers] = useState({ ...defaultMapLayers })
  const [activity, setActivity] = useState<{
    id: number
    requestId?: string
    text: string
  }[]>([{ id: 0, text: "Illustrative operation loaded · session started" }])
  const activitySequence = useRef(0)
  const [detail, setDetail] = useState(false)
  const [create, setCreate] = useState(false)
  const [newResource, setNewResource] = useState(initialStock[0].name)
  const [proposedQuantity, setProposedQuantity] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [query, setQuery] = useState("")
  const [globalSearch, setGlobalSearch] = useState("")
  const [priority, setPriority] = useState("All priorities")
  const [status, setStatus] = useState("All statuses")
  const [category, setCategory] = useState("All categories")
  const [toast, setToast] = useState("")
  const [toastTone, setToastTone] = useState<"success" | "error">("success")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const [menu, setMenu] = useState("")
  const [mobileNav, setMobileNav] = useState(false)
  const [editStock, setEditStock] = useState<Stock | null>(null)
  const [allocate, setAllocate] = useState<Request | null>(null)
  const [confirmation, setConfirmation] = useState<{
    command: Command
    title: string
    text: string
  } | null>(null)
  const [formError, setFormError] = useState("")
  const [focused, setFocused] = useState("")
  const [compact, setCompact] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [preview, setPreview] = useState("Normal")
  useEffect(() => {
    if (!mobileNav) return
    const previous =
      document.querySelector<HTMLElement>('[aria-label="Open navigation"]') ||
      document.activeElement as HTMLElement
    const sidebar = document.querySelector<HTMLElement>(".sidebar")!
    const controls = Array.from(
      sidebar.querySelectorAll<HTMLElement>("a,button"),
    )
    controls[0]?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNav(false)
      if (event.key === "Tab") {
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault()
          controls[controls.length - 1]?.focus()
        } else if (
          !event.shiftKey &&
          document.activeElement === controls[controls.length - 1]
        ) {
          event.preventDefault()
          controls[0]?.focus()
        }
      }
    }
    document.addEventListener("keydown", keydown)
    return () => {
      document.removeEventListener("keydown", keydown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [mobileNav])
  function notify(message: string, tone: "success" | "error" = "success") {
    clearTimeout(toastTimer.current)
    setToastTone(tone)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(""), 4500)
  }
  function navigate(next: string) {
    setPage(next)
    setMobileNav(false)
    setMenu("")
  }
  function openRequest(r: Request) {
    setMenu("")
    selectRequest(r)
    setDetail(true)
    setGlobalSearch("")
  }
  function selectRequest(r: Request) {
    setSelection({ kind: "request", id: r.id })
    if (!matchesMapFilters(r, mapFilters))
      setMapFilters({ ...defaultMapFilters })
    setMapLayers((layers) =>
      layers.requests ? layers : { ...layers, requests: true },
    )
  }
  function selectFromQueue(r: Request) {
    selectRequest(r)
    requestAnimationFrame(() =>
      document
        .querySelector(".map-view-stack")
        ?.scrollIntoView({ block: "nearest", behavior: "auto" }),
    )
  }
  const current =
    requests.find(
      (r) => selection.kind === "request" && r.id === selection.id,
    ) || requests[0]
  const filtered = requests.filter(
    (r) =>
      `${r.id} ${r.resource} ${r.zone}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (priority === "All priorities" || r.priority === priority) &&
      (status === "All statuses" || r.status === status),
  )
  const dashboard = page === "Overview" || page === "Live Operations"
  const shortfalls = needs(operations).filter((n) => n.missing > 0)
  const summary = metrics(operations)
  const actions = priorityActions(operations)
  const queue = requests
    .filter(
      (r) =>
        isActive(r) || (selection.kind === "request" && r.id === selection.id),
    )
    .slice()
    .sort((a, b) => priorityRank(a) - priorityRank(b))
  const allocationSnapshot = useRef(0)
  function commit(command: Command) {
    try {
      const next = applyCommand(operationsRef.current, command)
      operationsRef.current = next
      setOperations(next)
      const requestId =
        command.type === "create"
          ? command.request.id
          : command.type === "inventory"
            ? undefined
            : command.id
      const record = next.requests.find((r) => r.id === requestId)
      const text =
        command.type === "inventory"
          ? `${command.name} availability updated to ${command.available}`
          : `${requestId} · ${record?.history?.[record.history.length - 1] || "Coordinator action recorded"}`
      const id = ++activitySequence.current
      setActivity((events) => [{ id, requestId, text }, ...events].slice(0, 12))
      setFormError("")
      return true
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete this action."
      setFormError(message)
      notify(message, "error")
      return false
    }
  }
  function workflow(r: Request) {
    setFocused(r.id)
    setDetail(false)
    navigate("Allocation & Dispatch")
  }
  function reviewAllocation(r: Request) {
    allocationSnapshot.current = allocationFor(operations, r.id)?.quantity || 0
    setFormError("")
    setProposedQuantity(
      Math.min(
        unallocated(operations, r),
        stock.find((s) => s.name === r.resource)!.available,
      ),
    )
    setAllocate(r)
  }
  function confirm(command: Command, title: string, text: string) {
    setFormError("")
    setConfirmation({ command, title, text })
  }
  function submitRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const name = String(d.get("name")).trim(),
      zone = String(d.get("zone")).trim(),
      description = String(d.get("description")).trim()
    if (!name || !zone || !description) {
      setFormError(
        "Please complete all required fields. Whitespace-only values are not accepted.",
      )
      return
    }
    const r: Request = {
      id: `RQ-${1042 + requests.length}`,
      name,
      zone,
      description,
      contact: String(d.get("contact")).trim(),
      supporting: String(d.get("supporting")).trim(),
      resource: String(d.get("resource")),
      quantity: Number(d.get("quantity")),
      people: Number(d.get("people")),
      priority: d.get("priority") as Request["priority"],
      status: "Submitted",
      time: "Just now",
    }
    if (!commit({ type: "create", request: r })) return
    setCreate(false)
    setDirty(false)
    openRequest(r)
    notify(`${r.id} created. This request uses prototype data.`)
  }
  const closeCreate = () => (dirty ? setDiscard(true) : setCreate(false))
  return (
    <div className={`app ${compact ? "compact" : ""}`}>
      <a className="skip-link" href="#workspace-main">
        Skip to operations workspace
      </a>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside
        id="coordination-navigation"
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
        aria-label="Coordination navigation"
        role={mobileNav ? "dialog" : undefined}
        aria-modal={mobileNav ? true : undefined}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            navigate("Overview")
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          ResQ<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">COORDINATION WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item, i) => (
            <div key={item}>
              {i === 6 && <div className="nav-divider" />}
              <button
                className={`nav-item ${page === item ? "active" : ""}`}
                aria-label={item}
                aria-current={page === item ? "page" : undefined}
                onClick={() => navigate(item)}
              >
                <Icon name={navIcons[i]} size={19} />
                <span>{item}</span>
                {item === "Relief Requests" && <small>{requests.length}</small>}
                {item === "Unmet Needs" && (
                  <small className="need-count">{shortfalls.length}</small>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="operation-card">
            <span className="operation-symbol">
              <Icon name="shelter" size={18} />
            </span>
            <div>
              <strong>One mission. Many hands.</strong>
              <p>
                Every Request Matters.
                <br />
                Every Resource Counts.
              </p>
            </div>
          </div>
          <div className="sidebar-profile">
            <span className="avatar">AM</span>
            <div>
              <strong>Arjun Mehta</strong>
              <span>Relief Coordinator</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            aria-controls="coordination-navigation"
            onClick={() => setMobileNav(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="operation-title">
            <span className="operation-pin">
              <Icon name="pin" size={17} />
            </span>
            <strong>
              Monsoon Relief <span>— Maharashtra</span>
            </strong>
            <Badge tone="active-operation">
              <span className="dot" />
              Active operation
            </Badge>
          </div>
          <div className="header-tools">
            <div className="global-search">
              <Icon name="search" size={16} />
              <input
                aria-label="Search all requests"
                placeholder="Search anything..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch && (
                <div className="search-results">
                  {requests
                    .filter((r) =>
                      `${r.id} ${r.resource} ${r.zone}`
                        .toLowerCase()
                        .includes(globalSearch.toLowerCase()),
                    )
                    .map((r) => (
                      <button key={r.id} onClick={() => openRequest(r)}>
                        <strong>{r.id}</strong>
                        <span>
                          {r.resource} · {r.zone}
                        </span>
                      </button>
                    ))}
                  {!requests.some((r) =>
                    `${r.id} ${r.resource} ${r.zone}`
                      .toLowerCase()
                      .includes(globalSearch.toLowerCase()),
                  ) && <p>No matching requests</p>}
                </div>
              )}
            </div>
            <div className="header-divider" />
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() =>
                setMenu(menu === "notifications" ? "" : "notifications")
              }
            >
              <Icon name="bell" />
              {notifications && actions.length > 0 && <i />}
            </button>
            <button
              className="avatar avatar-button"
              aria-label="Coordinator menu"
              onClick={() => setMenu(menu === "profile" ? "" : "profile")}
            >
              AM
            </button>
          </div>
          {menu && (
            <div className="header-popover">
              {menu === "notifications" ? (
                <>
                  <h3>Prototype notifications</h3>
                  {actions.slice(0, 4).map((action) => (
                    <button
                      key={action.id}
                      onClick={() =>
                        action.inventory
                          ? navigate("Resource Inventory")
                          : openRequest(action.request!)
                      }
                    >
                      {action.title} · {action.request?.id || "Inventory"}
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                  {!actions.length && <p>No pending actions.</p>}
                </>
              ) : (
                <>
                  <strong>Arjun Mehta</strong>
                  <p>Relief Coordinator · Demo account</p>
                  <button onClick={() => navigate("Settings")}>
                    Workspace preferences <Icon name="settings" size={16} />
                  </button>
                </>
              )}
            </div>
          )}
        </header>
        <main id="workspace-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">OPERATIONS / {page.toUpperCase()}</div>
              <h1>{dashboard ? "Emergency Operations Center" : page}</h1>
              <p>
                {dashboard
                  ? "A coordinated response. A stronger community. Every resource, where it matters."
                  : page === "Relief Requests"
                    ? "Every request is a chance to make a difference. Track, review, and respond."
                    : page === "Resource Inventory"
                      ? "Know what’s available. Put every resource to work."
                      : page === "Allocation & Dispatch"
                        ? "Turn verified needs into coordinated, accountable action."
                        : page === "Unmet Needs"
                          ? "Identify the gaps. Prioritize the people who need help most."
                          : "Your coordination workspace, at a glance."}
              </p>
            </div>
            <div className="page-actions">
              {dashboard && (
                <button
                  className="button secondary"
                  onClick={() =>
                    navigate(
                      page === "Live Operations"
                        ? "Overview"
                        : "Live Operations",
                    )
                  }
                >
                  <Icon name="map" size={16} />
                  {page === "Live Operations"
                    ? "View Overview"
                    : "View Operations"}
                </button>
              )}
              <button
                className="button primary"
                onClick={() => {
                  setCreate(true)
                  setFormError("")
                  setNewResource(initialStock[0].name)
                  setDirty(false)
                }}
              >
                <Icon name="plus" size={17} />
                New Relief Request
              </button>
            </div>
          </div>
          <div className="context-line">
            <span className="demo-label">
              <span className="dot" />
              Illustrative prototype data
            </span>
            <span>
              <Icon name="clock" size={12} /> Demo snapshot · 24 Jul 2025, 10:45
              AM IST
            </span>
          </div>
          {dashboard ? (
            <>
              <div className="metrics">
                {[
                  {
                    label: "Active Incidents",
                    value: summary.active,
                    icon: "file",
                    note: "Open relief requests in this operation",
                    tone: "teal",
                    sub: "Session records",
                  },
                  {
                    label: "Critical Verified Requests",
                    value: summary.criticalVerified,
                    icon: "alert",
                    note: "Verified, active critical needs",
                    tone: "red",
                    sub: "Priority response",
                  },
                  {
                    label: "Unassigned Requests",
                    value: summary.unassigned,
                    icon: "file",
                    note: "No confirmed allocation or team",
                    tone: "blue",
                    sub: "Coordinator action required",
                  },
                  {
                    label: "Resources Available",
                    value: summary.availableUnits.toLocaleString(),
                    icon: "box",
                    note: "Unallocated resource units",
                    tone: "teal",
                    sub: `${summary.shelterSpaces} shelter spaces separately`,
                  },
                ].map((m) => (
                  <section className={`metric ${m.tone}`} key={m.label}>
                    <div className="metric-top">
                      <span>{m.label}</span>
                      <span className="metric-icon">
                        <Icon name={m.icon} size={19} />
                      </span>
                    </div>
                    <div className="metric-value">
                      {m.value}
                      {m.label === "Resources Available" && (
                        <small>units</small>
                      )}
                    </div>
                    <div className="metric-bottom">
                      <span>{m.note}</span>
                      <span className="metric-mini">
                        <span className="dot" />
                        {m.sub}
                      </span>
                    </div>
                  </section>
                ))}
              </div>
              <div className="dashboard-grid">
                <div className="main-column">
                  <ReliefMap
                    state={operations}
                    selection={selection}
                    onSelection={setSelection}
                    filters={mapFilters}
                    onFilters={setMapFilters}
                    layers={mapLayers}
                    onLayers={setMapLayers}
                    onRequest={selectRequest}
                    onDetails={openRequest}
                    onWorkflow={workflow}
                    onInventory={(resource) => {
                      setCategory(resource)
                      navigate("Resource Inventory")
                    }}
                    large={page === "Live Operations"}
                  />
                  <section className="panel queue-panel">
                    <div className="panel-heading">
                      <div className="heading-with-icon">
                        <h2>Priority Request Queue</h2>
                        <span className="count-chip">
                          {requests.length.toString().padStart(2, "0")}
                        </span>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => navigate("Relief Requests")}
                      >
                        View all requests <Icon name="arrow" size={14} />
                      </button>
                    </div>
                    <RequestTable
                      requests={queue}
                      onSelect={selectFromQueue}
                      onDetails={openRequest}
                      selectedId={
                        selection.kind === "request" ? selection.id : undefined
                      }
                      syncScroll
                    />
                    <div className="queue-footer">
                      <span>
                        <span className="dot" />
                        Prioritized by urgency and impact
                      </span>
                      <span>
                        {queue.length} demo records · active + selected closed
                      </span>
                    </div>
                  </section>
                  <section className="panel activity-timeline">
                    <div className="panel-heading">
                      <div className="heading-with-icon">
                        <Icon name="clock" size={16} />
                        <h2>Operational Activity</h2>
                      </div>
                      <span className="muted">Session events · simulated</span>
                    </div>
                    <ol>
                      {activity.map((event) => (
                        <li key={event.id}>
                          <span className="dot" />
                          <span className="activity-step">
                            {event.id ? "Action " + event.id : "Snapshot"}
                          </span>
                          {event.requestId ? (
                            <button
                              className="text-link"
                              onClick={() =>
                                openRequest(
                                  requests.find(
                                    (r) => r.id === event.requestId,
                                  )!,
                                )
                              }
                            >
                              {event.text}
                            </button>
                          ) : (
                            <span>{event.text}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <div className="field-note">
                    <Icon name="shelter" size={17} />
                    <span>Better coordination. Greater impact.</span>
                    <span>Working together to reach every community.</span>
                  </div>
                </div>
                <div className="right-rail">
                  <section className="panel resources-panel">
                    <div className="panel-heading">
                      <div className="heading-with-icon">
                        <Icon name="box" size={17} />
                        <h2>Resource Availability</h2>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Open inventory"
                        onClick={() => navigate("Resource Inventory")}
                      >
                        <Icon name="arrow" size={17} />
                      </button>
                    </div>
                    <div className="resource-list">
                      {stock.map((s) => (
                        <div className="resource-item" key={s.name}>
                          <div className="stock-title">
                            <span>
                              <Icon name={resourceIcon(s.name)} size={16} />
                              {s.name === "Temporary Shelter"
                                ? "Shelter Capacity"
                                : s.name === "Medical Supplies"
                                  ? "Medical Kits"
                                  : s.name}
                            </span>
                            <strong>
                              {s.available}
                              <small>{s.unit}</small>
                            </strong>
                          </div>
                          <div
                            className={`resource-bar ${
                              shortfalls.some(
                                ({ s: gapStock }) => gapStock.name === s.name,
                              )
                                ? "warning-bar"
                                : ""
                            }`}
                          >
                            <span
                              style={{
                                width: `${Math.min(100, (s.available / s.capacity) * 100)}%`,
                              }}
                            />
                            <i
                              style={{
                                width: `${Math.min(100 - (s.available / s.capacity) * 100, (s.allocated / s.capacity) * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="stock-meta">
                            <span>
                              {s.allocated} {s.unit} allocated
                            </span>
                            {shortfalls.some(
                              ({ s: gapStock }) => gapStock.name === s.name,
                            ) ? (
                              <span className="amber-text">
                                {s.name === "Temporary Shelter"
                                  ? "Demand exceeds capacity"
                                  : "Supply below demand"}
                              </span>
                            ) : (
                              <span>Available for dispatch</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="resource-legend">
                      <span>
                        <i />
                        Available
                      </span>
                      <span>
                        <i />
                        Allocated
                      </span>
                      <span>
                        <i />
                        Unavailable
                      </span>
                    </div>
                    <p className="subset-note">
                      Session inventory. Shelter spaces excluded from unit
                      totals.
                    </p>
                  </section>
                  <PriorityActions
                    state={operations}
                    onRequest={openRequest}
                    onWorkflow={workflow}
                    onInventory={(resource) => {
                      setCategory(resource)
                      navigate("Resource Inventory")
                    }}
                    onNeeds={(r) => {
                      setFocused(r.id)
                      navigate("Unmet Needs")
                    }}
                  />
                </div>
              </div>
            </>
          ) : page === "Relief Requests" ? (
            <section className="panel">
              <div className="filter-bar">
                <div className="search-field">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search requests"
                    placeholder="Search ID, resource, or zone..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {["All priorities", "Critical", "High", "Medium", "Low"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
                <select
                  aria-label="Filter status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {["All statuses", ...requestStatuses].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <button
                  className="text-link"
                  onClick={() => {
                    setQuery("")
                    setPriority("All priorities")
                    setStatus("All statuses")
                  }}
                >
                  Reset filters
                </button>
              </div>
              <RequestTable requests={filtered} onSelect={openRequest} />
            </section>
          ) : page === "Resource Inventory" ? (
            <>
              <div className="section-toolbar">
                <h2>
                  Available resources{" "}
                  <span className="muted">/ {stock.length} categories</span>
                </h2>
                <select
                  aria-label="Inventory category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {["All categories", ...stock.map((s) => s.name)].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="inventory-grid">
                {stock
                  .filter(
                    (s) => category === "All categories" || category === s.name,
                  )
                  .map((s) => (
                    <section className="panel inventory-card" key={s.name}>
                      <div className="inventory-icon">
                        <Icon name={resourceIcon(s.name)} size={26} />
                      </div>
                      <h2>{s.name}</h2>
                      <p>
                        <Icon name="pin" size={14} />
                        {s.location}
                      </p>
                      <div className="inventory-amount">
                        {s.available}
                        <small>{s.unit} available</small>
                      </div>
                      <div className="resource-bar">
                        <span
                          style={{
                            width: `${(s.available / s.capacity) * 100}%`,
                          }}
                        />
                        <i
                          style={{
                            width: `${(s.allocated / s.capacity) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="stock-meta">
                        <span>{s.allocated} allocated</span>
                        <span>{s.capacity} total capacity</span>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setFormError("")
                          setEditStock(s)
                        }}
                      >
                        Update availability <Icon name="arrow" size={15} />
                      </button>
                    </section>
                  ))}
              </div>
              <p className="helper">
                Inventory changes are session-only. Shelter capacity is measured
                in people, not resource units.
              </p>
            </>
          ) : page === "Allocation & Dispatch" ? (
            <AllocationBoard
              state={operations}
              onAllocate={reviewAllocation}
              onRequest={openRequest}
              onConfirm={confirm}
              focused={focused}
            />
          ) : page === "Unmet Needs" ? (
            <UnmetNeeds
              state={operations}
              focused={focused}
              onRequest={openRequest}
              onInventory={(resource) => {
                setCategory(resource)
                navigate("Resource Inventory")
              }}
            />
          ) : page === "Analytics" ? (
            <section className="panel analytics">
              <h2>Prototype response summary</h2>
              <p>Session records · same source as command center metrics</p>
              {requestStatuses.map((s) => (
                <div className="analytic-row" key={s}>
                  <span>{s}</span>
                  <div className="resource-bar">
                    <span
                      style={{
                        width: `${(requests.filter((r) => r.status === s).length / requests.length) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>
                    {requests.filter((r) => r.status === s).length}
                  </strong>
                </div>
              ))}
              <div className="need-values">
                <div>
                  <strong>{requests.reduce((n, r) => n + r.people, 0)}</strong>
                  <span>People in session requests</span>
                </div>
                <div>
                  <strong>{allocations.length}</strong>
                  <span>Confirmed allocations</span>
                </div>
                <div>
                  <strong>
                    {allocations.filter((a) => a.dispatchedQuantity > 0).length}
                  </strong>
                  <span>Dispatches recorded</span>
                </div>
              </div>
            </section>
          ) : (
            <section className="panel settings">
              <h2>Workspace preferences</h2>
              <p>
                Preferences and changes reset when this prototype is reloaded.
              </p>
              <label className="setting-row">
                <span>
                  <strong>Compact density</strong>
                  <small>
                    A tighter layout for larger coordination workspaces
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(e) => setCompact(e.target.checked)}
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>Notification indicators</strong>
                  <small>Display the illustrative notification indicator</small>
                </span>
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>Prototype state preview</strong>
                  <small>
                    Demonstrate local interface states; no network request is
                    made
                  </small>
                </span>
                <select
                  value={preview}
                  onChange={(e) => setPreview(e.target.value)}
                >
                  {["Normal", "Loading", "Empty", "Error"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              {preview !== "Normal" && (
                <div className="empty" role="status">
                  {preview === "Loading" ? (
                    "Loading preview — illustrative only."
                  ) : preview === "Empty" ? (
                    "No requests to display."
                  ) : (
                    <>
                      <p>Unable to display this simulated result.</p>
                      <button
                        className="button secondary"
                        onClick={() => setPreview("Normal")}
                      >
                        Try again
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          <footer className="app-footer">
            <span>
              ResQ <span className="footer-dot">/</span> Purpose-built for
              people.
            </span>
            <span>
              <span className="dot" />
              Prototype workspace · Changes are session-only
            </span>
          </footer>
        </main>
      </div>
      {detail && (
        <Modal
          title="Relief request details"
          drawer
          onClose={() => {
            setDetail(false)
          }}
        >
          <div className="detail-content">
            <div className="detail-id">
              <span>{current.id}</span>
              <Badge tone={current.priority}>{current.priority}</Badge>
            </div>
            <h2>{current.resource}</h2>
            <p className="detail-description">{current.description}</p>
            <div className="detail-grid">
              {[
                ["Location", current.zone],
                ["People affected", current.people],
                [
                  "Quantity requested",
                  `${current.quantity} ${
                    current.resource === "Temporary Shelter"
                      ? "people"
                      : "units"
                  }`,
                ],
                ["Received", current.time],
                ["Requester", current.name],
                ["Contact", current.contact || "Not provided in fixture"],
                ["Status", current.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="allocation-values">
              {[
                [
                  "Confirmed",
                  allocationFor(operations, current.id)?.quantity || 0,
                ],
                ["Unallocated", unallocated(operations, current)],
                [
                  "Dispatched",
                  allocationFor(operations, current.id)?.dispatchedQuantity ||
                    0,
                ],
                [
                  "Delivered",
                  allocationFor(operations, current.id)?.fulfilledQuantity || 0,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {current.supporting && (
              <div className="detail-history">
                <h3>Supporting information</h3>
                <p>{current.supporting}</p>
              </div>
            )}
            <div className="detail-history">
              <h3>Request history</h3>
              {(
                current.history || [
                  `Fixture snapshot · ${current.status} · ${current.time}`,
                ]
              ).map((event, index) => (
                <p key={index}>
                  <span className="dot" />
                  {event}
                </p>
              ))}
            </div>
            <div className="callout small">
              <Icon name="spark" size={18} />
              <p>
                Manual prototype workflow. Status changes, stock reservation,
                dispatch, and delivery each require coordinator confirmation.
              </p>
            </div>
            <div className="detail-workflow">
              {transitions(operations, current).map((next) => (
                <button
                  key={next}
                  className={`button ${
                    ["Cancelled", "Rejected"].includes(next)
                      ? "secondary danger-outline"
                      : "secondary"
                  }`}
                  onClick={() =>
                    confirm(
                      { type: "transition", id: current.id, status: next },
                      `Confirm ${next.toLowerCase()}`,
                      `Move ${current.id} from ${current.status} to ${next}?${
                        ["Cancelled", "Rejected"].includes(next) &&
                        allocationFor(operations, current.id)
                          ? " Reserved stock will be returned. This closes the request."
                          : ""
                      }`,
                    )
                  }
                >
                  {next === "Under Review"
                    ? "Start review"
                    : next === "Verified"
                      ? "Mark as verified"
                      : next === "Cancelled"
                        ? "Cancel request"
                        : next === "Rejected"
                          ? "Reject request"
                          : `Mark ${next.toLowerCase()}`}
                </button>
              ))}
            </div>
            {isActive(current) && isVerified(current) && (
              <button
                className="button primary full"
                onClick={() => workflow(current)}
              >
                Open allocation & dispatch
                <Icon name="arrow" size={16} />
              </button>
            )}
            {!isActive(current) && (
              <p className="helper">
                Closed request · {current.status}. No further transitions
                permitted.
              </p>
            )}
            <p className="helper">
              Illustrative prototype data · Session-only changes
            </p>
          </div>
        </Modal>
      )}
      {create && (
        <Modal title="New relief request" onClose={closeCreate}>
          <form
            onSubmit={submitRequest}
            onChange={() => setDirty(true)}
            className="request-form"
          >
            <p>
              Help us understand the need so the right support can reach the
              right people.
            </p>
            <div className="form-grid">
              <label>
                Requester name *
                <input
                  name="name"
                  required
                  placeholder="Full name"
                  maxLength={100}
                />
              </label>
              <label>
                Contact number *
                <input
                  name="contact"
                  type="tel"
                  required
                  pattern={"[+0-9 \\(\\)\\-]{7,20}"}
                  placeholder="+91 98765 43210"
                />
              </label>
              <label className="span-two">
                Location / zone *
                <input
                  name="zone"
                  required
                  placeholder="e.g. Zone A, community relief point"
                  maxLength={120}
                />
              </label>
              <label>
                Resource category *
                <select
                  name="resource"
                  value={newResource}
                  onChange={(e) => setNewResource(e.target.value)}
                >
                  {initialStock.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Urgency *
                <select name="priority">
                  {["Medium", "High", "Critical", "Low"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Quantity needed (
                {newResource === "Temporary Shelter"
                  ? "shelter spaces"
                  : "units"}
                ) *
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Units, or people for shelter"
                />
              </label>
              <label>
                People affected *
                <input
                  name="people"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Number of people"
                />
              </label>
              <label className="span-two">
                Description of need *
                <textarea
                  name="description"
                  required
                  rows={3}
                  placeholder="Describe the situation and support needed..."
                  maxLength={1000}
                />
              </label>
              <label className="span-two">
                Supporting information <span className="muted">(optional)</span>
                <textarea
                  name="supporting"
                  rows={2}
                  placeholder="Access instructions or additional context"
                  maxLength={1000}
                />
              </label>
            </div>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-footer">
              <span>Prototype only · No emergency service contacted</span>
              <div className="button-group">
                <button
                  type="button"
                  className="button secondary"
                  onClick={closeCreate}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit">
                  Submit request <Icon name="arrow" size={16} />
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
      {discard && (
        <Modal title="Discard this request?" onClose={() => setDiscard(false)}>
          <div className="request-form">
            <p>Your unsaved information will be lost.</p>
            <div className="button-group">
              <button
                className="button danger"
                onClick={() => {
                  setDiscard(false)
                  setCreate(false)
                  setDirty(false)
                }}
              >
                Discard
              </button>
              <button
                className="button secondary"
                onClick={() => setDiscard(false)}
              >
                Keep editing
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editStock && (
        <Modal
          title={`Update ${editStock.name}`}
          onClose={() => setEditStock(null)}
        >
          <form
            className="request-form"
            onSubmit={(e) => {
              e.preventDefault()
              const d = new FormData(e.currentTarget)
              const amount = Number(d.get("amount"))
              if (
                !commit({
                  type: "inventory",
                  name: editStock.name,
                  available: amount,
                })
              )
                return
              setEditStock(null)
              notify("Inventory availability updated for this session.")
            }}
          >
            <p>
              {editStock.location} · {editStock.allocated} {editStock.unit}{" "}
              already allocated
            </p>
            <label>
              Available quantity ({editStock.unit})
              <input
                name="amount"
                type="number"
                min="0"
                step="1"
                defaultValue={editStock.available}
                required
              />
            </label>
            <p className="helper">
              Updates do not change already confirmed allocations.
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button className="button primary" type="submit">
              Save availability
            </button>
          </form>
        </Modal>
      )}
      {allocate && (
        <Modal
          title="Review recommended allocation"
          onClose={() => setAllocate(null)}
        >
          <form
            className="request-form"
            onSubmit={(e) => {
              e.preventDefault()
              const d = new FormData(e.currentTarget)
              const quantity = Number(d.get("quantity"))
              const team = String(d.get("team"))
              if (
                !commit({
                  type: "allocate",
                  id: allocate.id,
                  quantity,
                  team,
                  expectedAllocated: allocationSnapshot.current,
                })
              )
                return
              setAllocate(null)
              notify(
                "Allocation confirmed. Stock reserved; dispatch is not yet recorded.",
              )
            }}
          >
            <Badge tone="ai">Recommendation · requires your confirmation</Badge>
            <h3>
              {allocate.id} · {allocate.resource}
            </h3>
            <p>
              Required: {allocate.quantity} · Unallocated:{" "}
              {unallocated(operations, allocate)} · Available:{" "}
              {stock.find((s) => s.name === allocate.resource)!.available}
            </p>
            <label>
              Quantity to allocate *
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                max={Math.min(
                  unallocated(operations, allocate),
                  stock.find((s) => s.name === allocate.resource)!.available,
                )}
                value={proposedQuantity}
                onChange={(e) => setProposedQuantity(Number(e.target.value))}
                required
              />
            </label>
            <p className="helper">
              Proposed: {proposedQuantity || 0} · Confirmed before this action:{" "}
              {allocationFor(operations, allocate.id)?.quantity || 0} ·
              Remaining stock after confirmation:{" "}
              {Math.max(
                0,
                stock.find((s) => s.name === allocate.resource)!.available -
                  proposedQuantity,
              )}{" "}
              · Still unallocated after proposal:{" "}
              {Math.max(
                0,
                unallocated(operations, allocate) - proposedQuantity,
              )}
            </p>
            <label>
              Response team *
              <select
                name="team"
                required
                defaultValue={
                  allocationFor(operations, allocate.id)?.team || ""
                }
              >
                <option value="">Select a response team</option>
                {responseTeams
                  .filter(
                    (team) =>
                      !allocationFor(operations, allocate.id) ||
                      team === allocationFor(operations, allocate.id)!.team,
                  )
                  .map((team) => (
                    <option key={team}>{team}</option>
                  ))}
              </select>
            </label>
            <p className="helper">
              Confirmation reserves inventory. Dispatch must be confirmed
              separately.
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button className="button primary" type="submit">
              <Icon name="check" size={16} />
              Confirm allocation
            </button>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <div className="request-form">
            <p>{confirmation.text}</p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => setConfirmation(null)}
              >
                Go back
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (commit(confirmation.command)) {
                    setConfirmation(null)
                    notify(
                      "Coordinator action recorded in this prototype session.",
                    )
                  }
                }}
              >
                Confirm action
                <Icon name="check" size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toastTone}`}
          role={toastTone === "error" ? "alert" : "status"}
        >
          <span>
            <Icon name={toastTone === "error" ? "alert" : "check"} size={18} />
            {toast}
          </span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
