import type { Request, Stock } from "./data"
import { isActive, needs, type Operations } from "./operations"

export type MapPoint = {
  x: number
  y: number
}
export type MapSelection = {
  kind: "request" | "center" | "shelter" | "area"
  id: string
}
export type MapFilters = {
  priority: string
  resource: string
  status: string
  location: string
}
export type MapLayers = {
  requests: boolean
  centers: boolean
  shelters: boolean
  areas: boolean
}
export const defaultMapFilters: MapFilters = {
  priority: "All priorities",
  resource: "All resources",
  status: "All statuses",
  location: "All locations",
}
export const defaultMapLayers: MapLayers = {
  requests: true,
  centers: true,
  shelters: true,
  areas: true,
}
export type DistributionCenter = {
  id: string
  name: string
  location: string
  zone: string
  resources: string[]
  point: MapPoint
}
export type Shelter = {
  id: string
  name: string
  location: string
  zone: string
  stockName: string
  point: MapPoint
}
export type AffectedArea = {
  id: string
  name: string
  zone: string
  point: MapPoint
}
export const distributionCenters: DistributionCenter[] = [
  {
    id: "DC-01",
    name: "Central distribution center",
    location: "Central warehouse · Pune",
    zone: "Zone A",
    resources: ["Drinking Water"],
    point: { x: 53, y: 47 },
  },
  {
    id: "DC-02",
    name: "Sangli distribution hub",
    location: "Distribution hub · Sangli",
    zone: "Zone B",
    resources: ["Food Kits"],
    point: { x: 82, y: 25 },
  },
  {
    id: "DC-03",
    name: "Kolhapur medical depot",
    location: "Medical depot · Kolhapur",
    zone: "Zone C",
    resources: ["Medical Supplies"],
    point: { x: 55, y: 81 },
  },
]
export const shelters: Shelter[] = [
  {
    id: "SH-01",
    name: "Community relief shelter",
    location: "Community relief shelter · Zone A",
    zone: "Zone A",
    stockName: "Temporary Shelter",
    point: { x: 78, y: 56 },
  },
]
const fixturePoints: Record<string, MapPoint> = {
  "RQ-1042": { x: 34, y: 38 },
  "RQ-1043": { x: 69, y: 30 },
  "RQ-1044": { x: 68, y: 69 },
  "RQ-1045": { x: 27, y: 72 },
}
const zonePoints: Record<string, MapPoint> = {
  "Zone A": { x: 30, y: 53 },
  "Zone B": { x: 74, y: 30 },
  "Zone C": { x: 65, y: 74 },
}
function hash(value: string) {
  return Array.from(value).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
}
export function areaPoint(zone: string): MapPoint {
  return (
    zonePoints[zone] || {
      x: 18 + (hash(zone) % 62),
      y: 25 + (hash(`${zone}-y`) % 52),
    }
  )
}
export function requestPoint(r: Request): MapPoint {
  const p = areaPoint(r.zone)
  return (
    fixturePoints[r.id] || {
      x: Math.min(90, Math.max(10, p.x + (hash(r.id) % 19) - 9)),
      y: Math.min(86, Math.max(20, p.y + (hash(`${r.id}-y`) % 21) - 10)),
    }
  )
}
export function affectedAreas(requests: Request[]): AffectedArea[] {
  return [...new Set(requests.map((r) => r.zone))].map((zone) => ({
    id: `area-${zone}`,
    name: `${zone} affected area`,
    zone,
    point: areaPoint(zone),
  }))
}
export function matchesMapFilters(r: Request, f: MapFilters) {
  return (
    (f.priority === "All priorities" || r.priority === f.priority) &&
    (f.resource === "All resources" || r.resource === f.resource) &&
    (f.status === "All statuses" || r.status === f.status) &&
    (f.location === "All locations" || r.zone === f.location)
  )
}
export function centerInventory(center: DistributionCenter, stock: Stock[]) {
  const rows = stock.filter((s) => center.resources.includes(s.name))
  return {
    rows,
    total: rows.reduce((n, s) => n + s.available + s.allocated, 0),
    available: rows.reduce((n, s) => n + s.available, 0),
    allocated: rows.reduce((n, s) => n + s.allocated, 0),
    low: rows.filter((s) => s.available / s.capacity <= 0.2),
  }
}
export function shelterCapacity(shelter: Shelter, state: Operations) {
  const stock = state.stock.find((s) => s.name === shelter.stockName)!
  const occupied = Math.min(stock.capacity, Math.max(0, stock.occupied || 0))
  const reserved = state.allocations
    .filter((a) =>
      state.requests.some(
        (r) => r.id === a.request && r.resource === shelter.stockName,
      ),
    )
    .reduce((n, a) => n + a.quantity - a.fulfilledQuantity, 0)
  const remaining = Math.max(0, stock.capacity - occupied)
  const available = Math.max(0, Math.min(stock.available, remaining - reserved))
  return {
    capacity: stock.capacity,
    occupied,
    reserved,
    remaining,
    available,
    status:
      available === 0
        ? "No allocatable spaces"
        : available / stock.capacity <= 0.2
          ? "Limited capacity"
          : "Spaces available",
  }
}
export function areaSummary(area: AffectedArea, state: Operations) {
  const requests = state.requests.filter((r) => r.zone === area.zone)
  const active = requests.filter(isActive)
  const shortages = needs(state).filter(
    (n) => n.r.zone === area.zone && n.missing > 0,
  )
  return {
    requests,
    people: active.reduce((n, r) => n + r.people, 0),
    critical: active.filter((r) => r.priority === "Critical").length,
    unmet: [...new Set(shortages.map((n) => n.r.resource))],
  }
}
export function clampPan(
  pan: MapPoint,
  zoom: number,
  width: number,
  height: number,
): MapPoint {
  if (zoom <= 1) return { x: 0, y: 0 }
  const x = (width * (zoom - 1)) / 2,
    y = (height * (zoom - 1)) / 2
  return {
    x: Math.max(-x, Math.min(x, pan.x)),
    y: Math.max(-y, Math.min(y, pan.y)),
  }
}
