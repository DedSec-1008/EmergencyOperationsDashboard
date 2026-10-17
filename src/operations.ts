import { type Request, type RequestStatus, type Stock } from "./data"

export type Allocation = {
  request: string
  quantity: number
  team: string
  dispatchedQuantity: number
  fulfilledQuantity: number
}
export type Operations = {
  requests: Request[]
  stock: Stock[]
  allocations: Allocation[]
}
export const responseTeams = [
  "Alpha · Ground relief",
  "Bravo · Medical response",
  "Delta · Community support",
]
export const isActive = (r: Request) =>
  !["Rejected", "Cancelled", "Fulfilled"].includes(r.status)
export const isVerified = (r: Request) =>
  [
    "Verified",
    "Awaiting Resources",
    "Allocated",
    "Dispatched",
    "Fulfilled",
  ].includes(r.status)
export const priorityRank = (r: Request) =>
  ({ Critical: 0, High: 1, Medium: 2, Low: 3 })[r.priority]
export const allocationFor = (state: Operations, id: string) =>
  state.allocations.find((a) => a.request === id)
export const unallocated = (state: Operations, r: Request) =>
  Math.max(0, r.quantity - (allocationFor(state, r.id)?.quantity || 0))

// Share a category's stock across outstanding requests in priority order, never once per row.
export function needs(state: Operations) {
  const pool = new Map(state.stock.map((s) => [s.name, s.available]))
  return state.requests
    .filter(isActive)
    .slice()
    .sort(
      (a, b) => priorityRank(a) - priorityRank(b) || a.id.localeCompare(b.id),
    )
    .map((r) => {
      const s = state.stock.find((s) => s.name === r.resource)!
      const remaining = unallocated(state, r)
      const available = Math.min(remaining, pool.get(s.name) || 0)
      pool.set(s.name, (pool.get(s.name) || 0) - available)
      return { r, s, remaining, available, missing: remaining - available }
    })
    .filter((n) => n.remaining > 0)
}
export function metrics(state: Operations) {
  const active = state.requests.filter(isActive)
  return {
    active: active.length,
    criticalVerified: active.filter(
      (r) => r.priority === "Critical" && isVerified(r),
    ).length,
    unassigned: active.filter((r) => !allocationFor(state, r.id)).length,
    availableUnits: state.stock
      .filter((s) => s.unit === "units")
      .reduce((n, s) => n + s.available, 0),
    shelterSpaces: state.stock
      .filter((s) => s.unit === "people")
      .reduce((n, s) => n + s.available, 0),
  }
}
export function transitions(state: Operations, r: Request): RequestStatus[] {
  if (!isActive(r)) return []
  const a = allocationFor(state, r.id)
  const shortage = needs(state).some((n) => n.r.id === r.id && n.missing > 0)
  const allowed: RequestStatus[] =
    r.status === "Submitted"
      ? ["Under Review"]
      : r.status === "Under Review"
        ? ["Verified"]
        : r.status === "Verified" && shortage
          ? ["Awaiting Resources"]
          : r.status === "Awaiting Resources" && !shortage
            ? ["Verified"]
            : []
  if (!a?.dispatchedQuantity) allowed.push("Rejected", "Cancelled")
  return allowed
}
function updateRequest(
  state: Operations,
  id: string,
  status: RequestStatus,
  event: string,
): Operations {
  return {
    ...state,
    requests: state.requests.map((r) =>
      r.id === id
        ? {
            ...r,
            status,
            history: [
              ...(r.history || [`Fixture snapshot · ${r.status}`]),
              event,
            ],
          }
        : r,
    ),
  }
}
export type Command = {
  type: "create"
  request: Request
} | {
  type: "inventory"
  name: string
  available: number
} | {
  type: "transition"
  id: string
  status: RequestStatus
} | {
  type: "allocate"
  id: string
  quantity: number
  team: string
  expectedAllocated: number
} | {
  type: "dispatch" | "fulfill"
  id: string
  expectedQuantity: number
}

export function applyCommand(state: Operations, command: Command): Operations {
  if (command.type === "create") {
    const r = command.request
    if (
      !r.name.trim() ||
      !r.zone.trim() ||
      !r.description.trim() ||
      !r.contact?.match(/^[+0-9 ()-]{7,20}$/) ||
      !Number.isSafeInteger(r.quantity) ||
      r.quantity <= 0 ||
      !Number.isSafeInteger(r.people) ||
      r.people <= 0 ||
      !state.stock.some((s) => s.name === r.resource) ||
      !["Critical", "High", "Medium", "Low"].includes(r.priority) ||
      state.requests.some((x) => x.id === r.id) ||
      r.status !== "Submitted"
    )
      throw new Error(
        "Complete all required fields with valid contact details and positive whole-number quantities.",
      )
    return {
      ...state,
      requests: [
        ...state.requests,
        {
          ...r,
          history: ["Submitted · created by coordinator in this session"],
        },
      ],
    }
  }
  if (command.type === "inventory") {
    const stock = state.stock.find((s) => s.name === command.name)
    const reserved = state.allocations
      .filter((a) =>
        state.requests.some(
          (r) => r.id === a.request && r.resource === command.name,
        ),
      )
      .reduce((n, a) => n + a.quantity - a.fulfilledQuantity, 0)
    if (
      stock?.unit === "people" &&
      command.available > stock.capacity - (stock.occupied || 0) - reserved
    )
      throw new Error(
        "Available shelter spaces cannot exceed capacity minus occupancy and confirmed reservations.",
      )
    if (
      !Number.isSafeInteger(command.available) ||
      command.available < 0 ||
      !state.stock.some((s) => s.name === command.name)
    )
      throw new Error("Enter a nonnegative whole-number inventory quantity.")
    return {
      ...state,
      stock: state.stock.map((s) =>
        s.name === command.name
          ? {
              ...s,
              available: command.available,
              capacity: Math.max(s.capacity, command.available + s.allocated),
            }
          : s,
      ),
    }
  }
  const r = state.requests.find((r) => r.id === command.id)
  if (!r) throw new Error("Request not found.")
  const a = allocationFor(state, r.id)
  const s = state.stock.find((s) => s.name === r.resource)!
  if (command.type === "transition") {
    if (!transitions(state, r).includes(command.status))
      throw new Error("This status transition is no longer permitted.")
    let next = state
    if (["Cancelled", "Rejected"].includes(command.status) && a) {
      next = {
        ...state,
        allocations: state.allocations.filter((x) => x.request !== r.id),
        stock: state.stock.map((x) =>
          x.name === s.name
            ? {
                ...x,
                available: x.available + a.quantity,
                allocated: x.allocated - a.quantity,
              }
            : x,
        ),
      }
    }
    return updateRequest(
      next,
      r.id,
      command.status,
      `${command.status} · confirmed by coordinator${
        a && ["Cancelled", "Rejected"].includes(command.status)
          ? "; reserved stock returned"
          : ""
      }`,
    )
  }
  if (command.type === "allocate") {
    const reserved = state.allocations
      .filter((a) =>
        state.requests.some(
          (x) => x.id === a.request && x.resource === r.resource,
        ),
      )
      .reduce((n, a) => n + a.quantity - a.fulfilledQuantity, 0)
    if (
      s.unit === "people" &&
      command.quantity > s.capacity - (s.occupied || 0) - reserved
    )
      throw new Error(
        "This allocation would exceed the shelter’s remaining capacity.",
      )
    if (
      !isActive(r) ||
      !isVerified(r) ||
      !responseTeams.includes(command.team) ||
      !Number.isSafeInteger(command.quantity) ||
      command.quantity <= 0 ||
      command.quantity > s.available ||
      command.quantity > unallocated(state, r) ||
      command.expectedAllocated !== (a?.quantity || 0) ||
      (a && command.team !== a.team)
    )
      throw new Error(
        "Allocation not committed. Check remaining demand, current stock, and the assigned team.",
      )
    const nextA: Allocation = {
      request: r.id,
      quantity: (a?.quantity || 0) + command.quantity,
      team: command.team,
      dispatchedQuantity: a?.dispatchedQuantity || 0,
      fulfilledQuantity: a?.fulfilledQuantity || 0,
    }
    const next = {
      ...state,
      stock: state.stock.map((x) =>
        x.name === s.name
          ? {
              ...x,
              available: x.available - command.quantity,
              allocated: x.allocated + command.quantity,
            }
          : x,
      ),
      allocations: [
        ...state.allocations.filter((x) => x.request !== r.id),
        nextA,
      ],
    }
    return updateRequest(
      next,
      r.id,
      "Allocated",
      `Allocation confirmed · ${command.quantity} ${s.unit} · ${command.team}`,
    )
  }
  if (!a || !isActive(r))
    throw new Error("A confirmed active allocation is required.")
  if (command.type === "dispatch") {
    const quantity = a.quantity - a.dispatchedQuantity
    if (quantity <= 0 || quantity !== command.expectedQuantity || !a.team)
      throw new Error("No matching allocation is awaiting dispatch.")
    const next = {
      ...state,
      allocations: state.allocations.map((x) =>
        x.request === r.id ? { ...x, dispatchedQuantity: x.quantity } : x,
      ),
      stock: state.stock.map((x) =>
        x.name === s.name ? { ...x, allocated: x.allocated - quantity } : x,
      ),
    }
    return updateRequest(
      next,
      r.id,
      "Dispatched",
      `Dispatch recorded · ${quantity} ${s.unit} · ${a.team} · manual prototype update`,
    )
  }
  const quantity = a.dispatchedQuantity - a.fulfilledQuantity
  if (quantity <= 0 || quantity !== command.expectedQuantity)
    throw new Error("Only dispatched quantities can be marked delivered.")
  const next = {
    ...state,
    stock: state.stock.map((s) =>
      s.name === r.resource && s.unit === "people"
        ? { ...s, occupied: (s.occupied || 0) + quantity }
        : s,
    ),
    allocations: state.allocations.map((x) =>
      x.request === r.id
        ? { ...x, fulfilledQuantity: x.dispatchedQuantity }
        : x,
    ),
  }
  const status =
    a.dispatchedQuantity === r.quantity
      ? "Fulfilled"
      : a.quantity > a.dispatchedQuantity
        ? "Allocated"
        : "Awaiting Resources"
  return updateRequest(
    next,
    r.id,
    status,
    `Delivery confirmed · ${quantity} ${s.unit}${
      status !== "Fulfilled"
        ? "; request remains partially unfulfilled"
        : "; request fulfilled"
    }`,
  )
}

export function priorityActions(state: Operations) {
  const actions: {
    id: string
    priority: Request["priority"]
    title: string
    text: string
    action: string
    request?: Request
    inventory?: string
  }[] = []
  for (const r of state.requests.filter(isActive)) {
    const a = allocationFor(state, r.id)
    if (r.priority === "Critical" && !isVerified(r))
      actions.push({
        id: `review-${r.id}`,
        priority: r.priority,
        title: "Critical request awaiting review",
        text: `${r.id} · ${r.zone} · ${r.status}`,
        action: "Review request",
        request: r,
      })
    if (
      isVerified(r) &&
      unallocated(state, r) > 0 &&
      state.stock.find((s) => s.name === r.resource)!.available > 0
    )
      actions.push({
        id: `allocate-${r.id}`,
        priority: r.priority,
        title: "Verified need awaiting allocation",
        text: `${r.id} · ${r.zone} · ${unallocated(state, r)} ${
          r.resource === "Temporary Shelter" ? "spaces" : "units"
        } unallocated`,
        action: "Review allocation",
        request: r,
      })
    if (a && a.quantity > a.dispatchedQuantity)
      actions.push({
        id: `dispatch-${r.id}`,
        priority: r.priority,
        title: "Confirmed stock awaiting dispatch",
        text: `${r.id} · ${r.zone} · ${a.quantity - a.dispatchedQuantity} reserved · ${a.team}`,
        action: "Review dispatch",
        request: r,
      })
    if (a && a.dispatchedQuantity > a.fulfilledQuantity)
      actions.push({
        id: `delivery-${r.id}`,
        priority: r.priority,
        title: "Delivery confirmation pending",
        text: `${r.id} · ${r.zone} · ${a.dispatchedQuantity - a.fulfilledQuantity} dispatched; not yet fulfilled`,
        action: "Review delivery",
        request: r,
      })
  }
  for (const n of needs(state).filter((n) => n.missing > 0))
    actions.push({
      id: `shortage-${n.r.id}`,
      priority: n.r.priority,
      title: "Resource shortage",
      text: `${n.r.id} · ${n.r.zone} · ${n.missing} ${n.s.unit} missing after priority coverage`,
      action: "Review unmet need",
      request: n.r,
    })
  for (const s of state.stock.filter((s) => s.available / s.capacity <= 0.2))
    actions.push({
      id: `stock-${s.name}`,
      priority: "High",
      title: `Low stock · ${s.name}`,
      text: `${s.location} · ${s.available} ${s.unit} available (≤20% capacity)`,
      action: "Update inventory",
      inventory: s.name,
    })
  return actions.sort(
    (a, b) =>
      ({ Critical: 0, High: 1, Medium: 2, Low: 3 })[a.priority] -
      { Critical: 0, High: 1, Medium: 2, Low: 3 }[b.priority],
  )
}
