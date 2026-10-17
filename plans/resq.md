# ResQ — Emergency Coordination UI Plan

## Goal and scope
Build a high-fidelity, interactive React prototype, prioritizing the Operations Dashboard at 1440 × 1000. Extend the same visual system to Relief Requests, Resource Inventory, Allocation & Dispatch, Unmet Needs, and a New Relief Request modal. This is an operational product, not a marketing page or generic analytics dashboard.

All records, metrics, map positions, notifications, and AI recommendations are illustrative. No backend, authentication, actual emergency locations, external map service, or real AI integration is included.

## Repository and approach
- Existing project: React 19, Vite 8, TypeScript, Tailwind v4; `src/App.tsx` is empty and there is no component library.
- Preserve the existing entrypoint and supervised development server. Do not start another server.
- Implement a lightweight local ResQ component system, using semantic HTML and accessible React behavior. No UI framework or routing dependency is required.
- Use `src/App.tsx` for shell and screen composition; add `src/components/` for shared controls, map, table, drawers, and modal; put typed fixtures and domain types in `src/data/`.
- Keep screen selection and prototype mutations in React state. Use a small shared state owner with callbacks rather than a global-state library. Reload resets the demo; communicate that changes are session-only.

## Visual direction
- Define semantic CSS variables in `src/index.css` using the supplied palette: background #0B1418, sidebar #101D22, cards #142329, elevated #1B2D33, accent #20C9A7, critical #FF5D5D, warning #FFB84D, success #55D6A7, text #F2F7F7, secondary #9BB0B5.
- Load public Inter through a Google Fonts CSS import before Tailwind; provide a system sans-serif fallback.
- Use restrained borders, 10–14px surface corners, compact line icons, consistent 4px-based spacing, tabular metrics, and strong section hierarchy. Reserve red for critical needs and destructive actions.
- Create a simple custom ResQ mark and consistent local SVG line icons; no emoji, photography, gradients, neon effects, or decorative charts.
- Include the tagline “Every Request Matters. Every Resource Counts.” in the sidebar or compact brand footer.

## Desktop dashboard
Use a fixed-width approximately 216px sidebar, a compact top header, and a fluid main workspace with 24px outer gutters. At 1440 × 1000, display the primary map and queue prominently; allow normal vertical scrolling rather than shrinking text to force everything into one frame.

### Shell
- Sidebar: ResQ branding; Overview active initially; Live Operations, Relief Requests, Resource Inventory, Allocation & Dispatch, Unmet Needs, Analytics, Settings; coordinator identity at bottom.
- Overview opens the dashboard; Live Operations opens its map-focused variant. Analytics and Settings open purposeful scoped panels rather than dead navigation: prototype operational summaries and display/preferences respectively.
- Header: “Monsoon Relief — Maharashtra,” active operation badge, search, notifications, coordinator avatar, and explicit demo last-updated time.
- Persistent small “Illustrative prototype data” label; never imply that active status or timestamps represent live emergency telemetry.
- Page title “Emergency Operations Center,” requested supporting copy, New Relief Request primary button, and View Operations secondary button targeting the map view.

### Information hierarchy
1. Four KPI cards: 248 Total Requests; 32 Critical Requests; 1,840 units Resources Available; 176 Requests Fulfilled. Each has an icon and restrained indicator, without invented trend percentages.
2. Dominant map on the left and narrower resource/intelligence rail on the right.
3. Priority request queue under the map, keeping critical records easy to scan.

### Illustrative relief map
- Build a responsive SVG map with schematic waterways, roads, zone boundaries, and subdued labels. Label it “Illustrative operational map · not for navigation.”
- Include distinct markers for critical requests, high-priority requests, distribution centers, and shelters; distinguish by shape/icon as well as color.
- Provide priority and category filters, a compact legend, reset view, and keyboard-selectable markers. Filters affect request markers, with an explicit empty state.
- Select RQ-1042 initially. Its overlay shows ID, Zone A, Drinking Water, quantity, 120 people, Critical priority, Verified status, and View details.
- Selecting a request marker or table row synchronizes the selected record. View details opens the shared detail drawer. Centers and shelters show their own short facility summaries.

### Priority queue
Columns: Request ID, Resource, Location, Priority, People affected, Time received, Status.
Seed the four supplied rows exactly:
- RQ-1042 / Drinking Water / Zone A / Critical / 120 / 10:42 AM / Verified.
- RQ-1043 / Food Kits / Zone B / High / 80 / 10:35 AM / Under Review.
- RQ-1044 / Medical Supplies / Zone C / Critical / 45 / 10:21 AM / Verified.
- RQ-1045 / Temporary Shelter / Zone A / Medium / 60 / 10:10 AM / Submitted.
Use priority badges and separate status treatments; clickable IDs and accessible row actions open details.

### Resource availability and intelligence
- Show available water 620 units, food 480 units, medical kits 120 units, shelter 350 people. Each fixture also defines allocated quantity and capacity for accurately labeled segmented bars.
- Distinguish available, allocated, and unavailable capacity with text and a shared legend. Flag low medical supply and shelter shortfall using explicit fixture demand, not implied real analysis.
- Preserve the supplied 1,840-unit KPI as an independent aggregate across all inventory; add a note that featured categories are a subset and shelter people are excluded from unit totals.
- Three recommendation cards cover local water shortage, medical review, and insufficient shelter. Each explains its fixture-based reason and offers Review Recommendation, opening related unmet needs or request records.
- Label the panel “Simulated prototype recommendations”; AI never verifies requests or confirms allocation automatically.

## Secondary workflows
### Relief Requests
Search by ID/resource/zone; priority and status filters; full request table; clear/reset filters and no-results state. Detail drawer includes all request fields, status history, and verification action. Submitted records can move to Under Review, then Verified through explicit coordinator actions, with confirmation and toast.

### Resource Inventory
Category filters, available/allocated quantities, storage location, low-stock badges, and update action. Update modal accepts nonnegative quantities, validates required fields, and updates shared resource state. Do not combine shelter people with resource units.

### Allocation & Dispatch
Show verified requests beside matching availability, priority explanations, suggested quantity, and response team selection. Recommended allocations use a labeled dashed treatment; confirmed allocations use a solid success treatment.
Coordinator reviews and confirms a positive quantity no greater than availability or remaining demand. Confirmation reduces available stock and increases allocated stock once. Dispatch requires confirmed allocation and assigned team; state advances to Dispatched with clear feedback. Prevent double submission and allocation for unverified requests.

### Unmet Needs
Show resource, location, urgency, required quantity, available quantity, calculated shortfall, and affected people. Sort critical unresolved needs first. Link each need to request detail and inventory. Recompute relevant shortfalls after fixture changes and never silently treat allocated stock as available.

### New Relief Request
Accessible modal, full-screen on mobile, with requester name, contact, location, category, quantity, people affected, urgency, description, and optional supporting text. Mark required fields. Validate trimmed required values, contact format, positive whole-number quantities/people, and category-dependent quantity units.
Submission creates a unique demo request with Submitted status, displays success feedback, and opens its detail. Cancel with dirty fields asks for discard confirmation. Supporting information is text only; no unsupported upload workflow.

### Auxiliary shell interactions
Header search filters across prototype requests and opens a selected result. Notifications show illustrative critical and inventory notices linked to relevant screens. Profile opens a small coordinator menu. Settings expose local compact-density and notification-display preferences; Analytics summarizes fixture request statuses without fabricated trends.

## Shared components and contracts
- Components: AppShell, Sidebar, Header, Button, IconButton, SearchField, FilterSelect, MetricCard, PriorityBadge, StatusBadge, ResourceBar, RequestTable, ReliefMap, RecommendationCard, Drawer, Modal, ConfirmDialog, Toast, EmptyState, LoadingState, ErrorState.
- Define typed Request, ResourceStock, Facility, Recommendation, Allocation, and ResponseTeam fixtures. Request and verification status remain distinct from allocation/dispatch status.
- All interactive controls have hover, focus-visible, active, disabled, and appropriate danger variants. Use explicit labels, not tooltip-only meaning.
- Loading/error components are reusable and demonstrable through a clearly labeled prototype state preview in Settings; do not fabricate network activity in the normal local-data flow.
- Dialogs trap focus, close with Escape unless a confirmation is needed, and restore focus. Announce validation and success/error feedback through accessible live regions.

## Mobile and accessibility
- At medium widths collapse the sidebar to an icon rail and stack the map with the supporting rail.
- Below approximately 768px replace the desktop shell with compact operation header, drawer navigation, and prominent quick-create action.
- Mobile order: critical alert summary, priority requests as readable cards, resource availability, collapsible map, recommendations. Do not simply shrink the desktop.
- Request details and creation become full-screen sheets. Tables scroll horizontally only where a card adaptation would lose meaningful comparisons.
- Maintain visible keyboard focus, semantic headings, labeled controls, touch targets around 44px, non-color status cues, contrast, reduced-motion support, and no map-only access to essential information.

## Delivery sequence
1. Establish tokens, reusable primitives, fixture types, and application shell.
2. Finish dashboard hierarchy, SVG map, queue, resource rail, and intelligence panel.
3. Connect request creation, filtering, detail, and verification.
4. Add inventory, allocation/dispatch, unmet needs, and scoped auxiliary navigation.
5. Polish responsive layouts and shared empty/loading/error/confirmation states.

## Verification and acceptance
- For this multi-screen implementation run the repository production command `pnpm build`; resolve any introduced failures. Do not start a development server.
- Use the existing preview to inspect desktop 1440 × 1000 and mobile approximately 390 × 844, where a preview inspection capability is available.
- Check navigation, map selection/filter/reset, search/no-results, request validation and cancel, verification, inventory edits, recommendation links, allocation stock limits, duplicate prevention, team requirement, dispatch, and toasts.
- Keyboard-check navigation and dialog focus; inspect overflow, contrast, and readable labels.
- Success: the coordinator can identify critical needs, inspect a request, review stock, verify it, and confirm/dispatch an allocation; all screens share one polished visual language and prominently distinguish simulated data from real operations.
- If preview inspection is unavailable, report that limitation rather than claiming runtime or visual verification.

## Explicit exclusions
No backend persistence, real geocoding, GPS/navigation, emergency communications, real-time feeds, real AI, production auth, file uploads, deployment, or claims of operational readiness. UI polish and a coherent prototype workflow take precedence over breadth beyond the screens above.
