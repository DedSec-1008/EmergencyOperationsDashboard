import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

function source(path, imports = {}) {
  let { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  for (const [name, url] of Object.entries(imports))
    outputText = outputText.replace(`"${name}"`, JSON.stringify(url))
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
}
const operationURL = source("../src/operations.ts")
const { initialRequests, initialStock } = await import(source("../src/data.ts"))
const { applyCommand, metrics } = await import(operationURL)
const {
  defaultMapFilters,
  matchesMapFilters,
  requestPoint,
  affectedAreas,
  areaSummary,
  centerInventory,
  distributionCenters,
  shelters,
  shelterCapacity,
  clampPan,
} = await import(source("../src/mapModel.ts", { "./operations": operationURL }))
const initial = () =>
  structuredClone({
    requests: initialRequests,
    stock: initialStock,
    allocations: [],
  })

test("map priority, resource, status and location filters match application records", () => {
  const filter = (patch) =>
    initialRequests
      .filter((r) => matchesMapFilters(r, { ...defaultMapFilters, ...patch }))
      .map((r) => r.id)
  assert.deepEqual(filter({ priority: "Critical" }), ["RQ-1042", "RQ-1044"])
  assert.deepEqual(filter({ resource: "Food Kits" }), ["RQ-1043"])
  assert.deepEqual(filter({ status: "Submitted" }), ["RQ-1045"])
  assert.deepEqual(filter({ location: "Zone C" }), ["RQ-1044"])
  assert.deepEqual(filter({ priority: "Low" }), [])
  assert.deepEqual(filter({ priority: "Critical", status: "Submitted" }), [])
})
test("schematic request positions are stable by ID and bounded for new records", () => {
  assert.deepEqual(requestPoint(initialRequests[0]), { x: 34, y: 38 })
  for (let i = 0; i < 100; i++) {
    const r = {
      ...initialRequests[0],
      id: `RQ-${2000 + i}`,
      zone: `New zone ${i}`,
    }
    const p = requestPoint(r)
    assert.deepEqual(requestPoint({ ...r, status: "Dispatched" }), p)
    assert.ok(p.x >= 10 && p.x <= 90 && p.y >= 20 && p.y <= 86)
  }
})
test("every facility inventory category maps to a real stock record without unit mixing", () => {
  const state = initial()
  for (const c of distributionCenters) {
    const s = centerInventory(c, state.stock)
    assert.ok(s.rows.length)
    assert.ok(s.rows.every((s) => s.unit === "units"))
    assert.equal(s.total, s.available + s.allocated)
  }
  const next = applyCommand(state, {
    type: "allocate",
    id: "RQ-1042",
    quantity: 200,
    team: "Alpha · Ground relief",
    expectedAllocated: 0,
  })
  assert.deepEqual(
    {
      ...centerInventory(distributionCenters[0], next.stock),
      rows: undefined,
      low: undefined,
    },
    {
      total: 620,
      available: 420,
      allocated: 200,
      rows: undefined,
      low: undefined,
    },
  )
  assert.equal(metrics(next).availableUnits, 1020)
})
test("affected area records link requests, people, critical needs and current shortages", () => {
  const state = initial(),
    areas = affectedAreas(state.requests)
  assert.equal(areas.length, 3)
  const a = areas.find((a) => a.zone === "Zone A"),
    summary = areaSummary(a, state)
  assert.deepEqual(
    summary.requests.map((r) => r.id),
    ["RQ-1042", "RQ-1045"],
  )
  assert.equal(summary.people, 180)
  assert.equal(summary.critical, 1)
  assert.deepEqual(summary.unmet, ["Temporary Shelter"])
  const next = applyCommand(state, {
    type: "transition",
    id: "RQ-1042",
    status: "Cancelled",
  })
  assert.equal(areaSummary(a, next).critical, 0)
  assert.equal(areaSummary(a, next).people, 60)
})
test("shelter capacity distinguishes occupancy, reservations and delivery", () => {
  let state = initial()
  for (const status of ["Under Review", "Verified"])
    state = applyCommand(state, { type: "transition", id: "RQ-1045", status })
  assert.equal(shelterCapacity(shelters[0], state).occupied, 350)
  state = applyCommand(state, {
    type: "allocate",
    id: "RQ-1045",
    quantity: 100,
    team: "Delta · Community support",
    expectedAllocated: 0,
  })
  assert.equal(shelterCapacity(shelters[0], state).available, 250)
  assert.equal(shelterCapacity(shelters[0], state).reserved, 100)
  assert.equal(shelterCapacity(shelters[0], state).occupied, 350)
  state = applyCommand(state, {
    type: "dispatch",
    id: "RQ-1045",
    expectedQuantity: 100,
  })
  assert.equal(shelterCapacity(shelters[0], state).occupied, 350)
  assert.equal(shelterCapacity(shelters[0], state).reserved, 100)
  state = applyCommand(state, {
    type: "fulfill",
    id: "RQ-1045",
    expectedQuantity: 100,
  })
  assert.equal(shelterCapacity(shelters[0], state).occupied, 450)
  assert.equal(shelterCapacity(shelters[0], state).reserved, 0)
  assert.equal(shelterCapacity(shelters[0], state).available, 250)
  assert.throws(() =>
    applyCommand(state, {
      type: "inventory",
      name: "Temporary Shelter",
      available: 251,
    }),
  )
  assert.throws(() =>
    applyCommand(state, {
      type: "inventory",
      name: "Temporary Shelter",
      available: -1,
    }),
  )
})
test("full shelter reservations cannot overfill capacity, including while en route", () => {
  let state = initial()
  for (const status of ["Under Review", "Verified"])
    state = applyCommand(state, { type: "transition", id: "RQ-1045", status })
  state = applyCommand(state, {
    type: "allocate",
    id: "RQ-1045",
    quantity: 350,
    team: "Delta · Community support",
    expectedAllocated: 0,
  })
  assert.equal(shelterCapacity(shelters[0], state).available, 0)
  state = applyCommand(state, {
    type: "dispatch",
    id: "RQ-1045",
    expectedQuantity: 350,
  })
  assert.throws(() =>
    applyCommand(state, {
      type: "inventory",
      name: "Temporary Shelter",
      available: 1,
    }),
  )
  state = applyCommand(state, {
    type: "fulfill",
    id: "RQ-1045",
    expectedQuantity: 350,
  })
  const stats = shelterCapacity(shelters[0], state)
  assert.equal(stats.occupied, stats.capacity)
  assert.equal(stats.remaining, 0)
  assert.equal(stats.available, 0)
})
test("zoomed panning stays bounded and resets to zero at native scale", () => {
  assert.deepEqual(clampPan({ x: 500, y: -500 }, 1, 800, 400), { x: 0, y: 0 })
  assert.deepEqual(clampPan({ x: 500, y: -500 }, 2, 800, 400), {
    x: 400,
    y: -200,
  })
  assert.deepEqual(clampPan({ x: 20, y: 30 }, 2, 800, 400), { x: 20, y: 30 })
})
test("new Low-priority requests receive selectable schematic positions and area records", () => {
  const r = {
    ...initialRequests[0],
    id: "RQ-1046",
    zone: "Zone D",
    priority: "Low",
    status: "Submitted",
    contact: "+91 98765 43210",
  }
  const state = applyCommand(initial(), { type: "create", request: r })
  assert.ok(
    matchesMapFilters(state.requests[4], {
      ...defaultMapFilters,
      priority: "Low",
    }),
  )
  assert.ok(affectedAreas(state.requests).some((a) => a.zone === "Zone D"))
  assert.ok(requestPoint(state.requests[4]).x >= 10)
})
