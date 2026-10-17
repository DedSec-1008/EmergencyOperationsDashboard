export type Priority = "Critical" | "High" | "Medium" | "Low"
export const requestStatuses = [
  "Submitted",
  "Under Review",
  "Verified",
  "Awaiting Resources",
  "Allocated",
  "Dispatched",
  "Fulfilled",
  "Rejected",
  "Cancelled",
] as const
export type RequestStatus = typeof requestStatuses[number]
export type Request = {
  id: string
  resource: string
  zone: string
  priority: Priority
  people: number
  time: string
  status: RequestStatus
  quantity: number
  name: string
  description: string
  contact?: string
  supporting?: string
  history?: string[]
}
export type Stock = {
  name: string
  available: number
  allocated: number
  capacity: number
  unit: string
  location: string
  occupied?: number
}
export const initialRequests: Request[] = [
  {
    id: "RQ-1042",
    resource: "Drinking Water",
    zone: "Zone A",
    priority: "Critical",
    people: 120,
    time: "10:42 AM",
    status: "Verified",
    quantity: 200,
    name: "Ananya Deshmukh",
    description:
      "Clean drinking water needed for families affected by flooding. Local water sources are currently inaccessible.",
  },
  {
    id: "RQ-1043",
    resource: "Food Kits",
    zone: "Zone B",
    priority: "High",
    people: 80,
    time: "10:35 AM",
    status: "Under Review",
    quantity: 100,
    name: "Rohan Patil",
    description:
      "Ready-to-eat food kits required at the community relief point.",
  },
  {
    id: "RQ-1044",
    resource: "Medical Supplies",
    zone: "Zone C",
    priority: "Critical",
    people: 45,
    time: "10:21 AM",
    status: "Verified",
    quantity: 160,
    name: "Dr. Meera Shah",
    description:
      "Urgent first-aid and medical kits needed for the temporary health camp.",
  },
  {
    id: "RQ-1045",
    resource: "Temporary Shelter",
    zone: "Zone A",
    priority: "Medium",
    people: 60,
    time: "10:10 AM",
    status: "Submitted",
    quantity: 420,
    name: "Amit Kulkarni",
    description: "Temporary shelter capacity needed for displaced residents.",
  },
]
export const initialStock: Stock[] = [
  {
    name: "Drinking Water",
    available: 620,
    allocated: 0,
    capacity: 1000,
    unit: "units",
    location: "Central warehouse · Pune",
  },
  {
    name: "Food Kits",
    available: 480,
    allocated: 0,
    capacity: 800,
    unit: "units",
    location: "Distribution hub · Sangli",
  },
  {
    name: "Medical Supplies",
    available: 120,
    allocated: 0,
    capacity: 400,
    unit: "units",
    location: "Medical depot · Kolhapur",
  },
  {
    name: "Temporary Shelter",
    available: 350,
    allocated: 0,
    capacity: 700,
    unit: "people",
    location: "Community relief shelters",
    occupied: 350,
  },
]
export const navItems = [
  "Overview",
  "Live Operations",
  "Relief Requests",
  "Resource Inventory",
  "Allocation & Dispatch",
  "Unmet Needs",
  "Analytics",
  "Settings",
]
