import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

// Run the same pure TypeScript commands used by the UI without adding a test dependency.
async function source(path) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  )
}
const { initialRequests, initialStock } = await source("../src/data.ts")
const {
  applyCommand,
  metrics,
  needs,
  transitions,
  priorityActions,
  unallocated,
} = await source("../src/operations.ts")
const initial = () =>
  structuredClone({
    requests: initialRequests,
    stock: initialStock,
    allocations: [],
  })
const request = (state, id) => state.requests.find((r) => r.id === id)
const water = (state) => state.stock.find((s) => s.name === "Drinking Water")
const command = (quantity = 200, id = "RQ-1042", expectedAllocated = 0) => ({
  type: "allocate",
  id,
  quantity,
  expectedAllocated,
  team: "Alpha · Ground relief",
})

test("dashboard metrics are derived, and shelter people are never summed with units", () => {
  assert.deepEqual(metrics(initial()), {
    active: 4,
    criticalVerified: 2,
    unassigned: 4,
    availableUnits: 1220,
    shelterSpaces: 350,
  })
  const next = applyCommand(initial(), command())
  assert.equal(metrics(next).availableUnits, 1020)
  assert.equal(metrics(next).unassigned, 3)
  assert.equal(request(next, "RQ-1042").status, "Allocated")
})
test("request creation validates fields and changes metrics", () => {
  const r = {
    ...initialRequests[0],
    id: "RQ-1046",
    status: "Submitted",
    contact: "+91 98765 43210",
  }
  const next = applyCommand(initial(), { type: "create", request: r })
  assert.equal(metrics(next).active, 5)
  assert.equal(metrics(next).unassigned, 5)
  for (const patch of [
    { name: " " },
    { contact: "bad" },
    { contact: " " },
    { quantity: 0 },
    { quantity: 1.5 },
    { people: -1 },
    { resource: "Unknown" },
    { id: "RQ-1042" },
  ]) {
    assert.throws(() =>
      applyCommand(initial(), { type: "create", request: { ...r, ...patch } }),
    )
  }
})
test("submitted requests must be reviewed before verification and allocation", () => {
  let state = initial()
  assert.throws(() =>
    applyCommand(state, {
      type: "transition",
      id: "RQ-1045",
      status: "Verified",
    }),
  )
  assert.throws(() => applyCommand(state, command(10, "RQ-1045")))
  for (const status of ["Under Review", "Verified", "Awaiting Resources"])
    state = applyCommand(state, { type: "transition", id: "RQ-1045", status })
  assert.equal(request(state, "RQ-1045").status, "Awaiting Resources")
  assert.equal(request(state, "RQ-1045").history.length, 4)
})
test("allocation rejects oversupply, overdemand, fractional, negative and invalid-team inputs atomically", () => {
  for (const patch of [
    { quantity: 621 },
    { quantity: 201 },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.2 },
    { team: "Unknown" },
    { expectedAllocated: 20 },
  ]) {
    const state = initial()
    assert.throws(() => applyCommand(state, { ...command(), ...patch }))
    assert.equal(water(state).available, 620)
    assert.equal(state.allocations.length, 0)
  }
})
test("stale/double allocation cannot consume inventory twice", () => {
  const state = applyCommand(initial(), command(100))
  assert.throws(() => applyCommand(state, command(100)))
  assert.equal(water(state).available, 520)
  const next = applyCommand(state, command(100, "RQ-1042", 100))
  assert.equal(water(next).available, 420)
  assert.equal(next.allocations[0].quantity, 200)
})
test("partial allocation, dispatch, delivery, restock and fulfillment stay consistent", () => {
  let state = applyCommand(initial(), command(120, "RQ-1044"))
  assert.equal(unallocated(state, request(state, "RQ-1044")), 40)
  assert.equal(needs(state).find((n) => n.r.id === "RQ-1044").missing, 40)
  assert.throws(() =>
    applyCommand(state, {
      type: "fulfill",
      id: "RQ-1044",
      expectedQuantity: 120,
    }),
  )
  state = applyCommand(state, {
    type: "dispatch",
    id: "RQ-1044",
    expectedQuantity: 120,
  })
  assert.equal(request(state, "RQ-1044").status, "Dispatched")
  assert.equal(
    state.stock.find((s) => s.name === "Medical Supplies").allocated,
    0,
  )
  assert.throws(() =>
    applyCommand(state, {
      type: "dispatch",
      id: "RQ-1044",
      expectedQuantity: 120,
    }),
  )
  assert.throws(() =>
    applyCommand(state, {
      type: "transition",
      id: "RQ-1044",
      status: "Cancelled",
    }),
  )
  state = applyCommand(state, {
    type: "fulfill",
    id: "RQ-1044",
    expectedQuantity: 120,
  })
  assert.equal(request(state, "RQ-1044").status, "Awaiting Resources")
  state = applyCommand(state, {
    type: "inventory",
    name: "Medical Supplies",
    available: 40,
  })
  state = applyCommand(state, command(40, "RQ-1044", 120))
  state = applyCommand(state, {
    type: "dispatch",
    id: "RQ-1044",
    expectedQuantity: 40,
  })
  state = applyCommand(state, {
    type: "fulfill",
    id: "RQ-1044",
    expectedQuantity: 40,
  })
  assert.equal(request(state, "RQ-1044").status, "Fulfilled")
  assert.equal(state.allocations[0].fulfilledQuantity, 160)
  assert.equal(metrics(state).active, 3)
  assert.equal(metrics(state).criticalVerified, 1)
  assert.ok(!needs(state).some((n) => n.r.id === "RQ-1044"))
  assert.ok(!priorityActions(state).some((a) => a.request?.id === "RQ-1044"))
  assert.throws(() =>
    applyCommand(state, {
      type: "fulfill",
      id: "RQ-1044",
      expectedQuantity: 40,
    }),
  )
})
test("cancelling or rejecting before dispatch returns reserved stock and closes the request", () => {
  for (const status of ["Cancelled", "Rejected"]) {
    const state = applyCommand(applyCommand(initial(), command(100)), {
      type: "transition",
      id: "RQ-1042",
      status,
    })
    assert.equal(water(state).available, 620)
    assert.equal(water(state).allocated, 0)
    assert.equal(state.allocations.length, 0)
    assert.deepEqual(transitions(state, request(state, "RQ-1042")), [])
    assert.ok(!priorityActions(state).some((a) => a.request?.id === "RQ-1042"))
  }
})
test("shared stock covers multiple needs only once, in priority order", () => {
  const state = initial()
  state.requests.push({
    ...initialRequests[0],
    id: "RQ-1046",
    quantity: 500,
    priority: "High",
  })
  const rows = needs(state).filter((n) => n.s.name === "Drinking Water")
  assert.equal(rows[0].available, 200)
  assert.equal(rows[1].available, 420)
  assert.equal(rows[1].missing, 80)
  const next = applyCommand(state, command())
  assert.equal(needs(next).find((n) => n.r.id === "RQ-1046").available, 420)
  assert.equal(needs(next).find((n) => n.r.id === "RQ-1046").missing, 80)
})
test("inventory changes preserve reservations, recalculate gaps and reject invalid quantities", () => {
  const state = applyCommand(initial(), command(100))
  const next = applyCommand(state, {
    type: "inventory",
    name: "Drinking Water",
    available: 1000,
  })
  assert.equal(water(next).allocated, 100)
  assert.ok(water(next).capacity >= 1100)
  assert.ok(
    !needs(next).some((n) => n.s.name === "Drinking Water" && n.missing > 0),
  )
  for (const available of [-1, NaN, Infinity, 0.5])
    assert.throws(() =>
      applyCommand(state, {
        type: "inventory",
        name: "Drinking Water",
        available,
      }),
    )
})
test("priority actions follow confirmed states, and alerts clear after replenishment", () => {
  let state = initial()
  assert.ok(priorityActions(state).some((a) => a.id === "allocate-RQ-1042"))
  assert.ok(priorityActions(state).some((a) => a.id === "shortage-RQ-1044"))
  state = applyCommand(state, command())
  assert.ok(!priorityActions(state).some((a) => a.id === "allocate-RQ-1042"))
  assert.ok(priorityActions(state).some((a) => a.id === "dispatch-RQ-1042"))
  state = applyCommand(state, {
    type: "dispatch",
    id: "RQ-1042",
    expectedQuantity: 200,
  })
  assert.ok(!priorityActions(state).some((a) => a.id === "dispatch-RQ-1042"))
  assert.ok(priorityActions(state).some((a) => a.id === "delivery-RQ-1042"))
  state = applyCommand(state, {
    type: "inventory",
    name: "Medical Supplies",
    available: 200,
  })
  assert.ok(!priorityActions(state).some((a) => a.id === "shortage-RQ-1044"))
})
