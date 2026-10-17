// Run against the existing dev server: APP_URL=http://localhost:3000 node tests/browser-map.mjs
// Uses a locally installed Chromium and Node's built-in CDP/WebSocket APIs; no added dependencies.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const appURL = process.env.APP_URL || "http://localhost:3000"
const port = Number(process.env.CDP_PORT || 9333)
const profile = mkdtempSync(join(tmpdir(), "resq-map-browser-"))
const screenshots = mkdtempSync(join(tmpdir(), "resq-map-screenshots-"))
const browser = spawn(
  process.env.CHROMIUM_BIN || "chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let ws
const errors = []
try {
  let targets
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch(`http://localhost:${port}/json/list`)).json()
      break
    } catch {
      await pause(100)
    }
  }
  assert.ok(targets, "Chromium debugging endpoint did not start")
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  )
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true })
    ws.addEventListener("error", reject, { once: true })
  })
  let id = 0
  let pageLoaded
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (!entry) return
      if (message.error) entry.reject(message.error)
      else entry.resolve(message.result)
    } else if (message.method === "Page.loadEventFired") pageLoaded?.()
    else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      )
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id
      pending.set(key, { resolve, reject })
      ws.send(JSON.stringify({ id: key, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      )
    return result.result.value
  }
  const wait = async (expression) => {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(expression)) return
      await pause(100)
    }
    throw Error(`Timed out: ${expression}`)
  }
  const element = (selector) =>
    `document.querySelector(${JSON.stringify(selector)})`
  const clickExpression = async (expression) => {
    const rect = await evaluate(
      `(()=>{const e=${expression};if(!e)throw Error("Missing click target");e.scrollIntoView({block:"nearest"});e.focus();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    )
    const hit = await evaluate(
      `(()=>{const e=${expression},h=document.elementFromPoint(${rect.x},${rect.y});return {ok:!!h&&(e===h||e.contains(h)),blockedBy:h?.outerHTML.slice(0,250)}})()`,
    )
    assert.ok(hit.ok, `Click target is obstructed: ${hit.blockedBy}`)
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...rect,
    })
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...rect,
    })
    await pause(100)
  }
  const click = (selector) => clickExpression(element(selector))
  const textButton = (text, scope = "document") =>
    `[...${scope}.querySelectorAll("button")].find(e=>e.textContent.trim()===${JSON.stringify(text)})`
  const clickText = (text, scope = "document") =>
    clickExpression(textButton(text, scope))
  const set = async (selector, value) => {
    await evaluate(
      `(()=>{const e=${element(selector)};const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()`,
    )
    await pause(70)
  }
  const selected = async (id) => {
    assert.equal(
      await evaluate(
        `document.querySelector(".map-marker[aria-pressed=true]")?.getAttribute("aria-label").startsWith(${JSON.stringify(id)})`,
      ),
      true,
    )
    assert.equal(
      await evaluate(
        `document.querySelector(".queue-panel tr.selected-request-row")?.dataset.requestId`,
      ),
      id,
    )
    assert.ok(
      await evaluate(
        `document.querySelector(".map-context").textContent.includes(${JSON.stringify(id)})`,
      ),
    )
  }
  const reset = () => click('[aria-label="Reset map view"]')
  const minimize = async () => {
    if (await evaluate(`!!${element('[aria-label="Minimize map details"]')}`))
      await click('[aria-label="Minimize map details"]')
  }
  const navigate = async (page) => {
    if (
      await evaluate(
        `getComputedStyle(${element('[aria-label="Open navigation"]')}).display!=="none"`,
      )
    )
      await click('[aria-label="Open navigation"]')
    await click(`.nav-item[aria-label="${page}"]`)
  }
  const screen = async (name) => {
    const image = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })
    writeFileSync(
      join(screenshots, `${name}.png`),
      Buffer.from(image.data, "base64"),
    )
  }
  const paint = (selector, property) =>
    evaluate(
      `getComputedStyle(${element(selector)})[${JSON.stringify(property)}]`,
    )
  const checkTheme = async (page) => {
    assert.equal(
      await paint("html", "backgroundColor"),
      "rgb(11, 17, 32)",
      `${page}: background`,
    )
    assert.equal(
      await paint(".sidebar", "backgroundColor"),
      "rgb(16, 26, 44)",
      `${page}: sidebar`,
    )
    assert.equal(
      await paint(".panel", "backgroundColor"),
      "rgb(23, 36, 56)",
      `${page}: panel`,
    )
    assert.equal(
      await paint(".button.primary", "backgroundColor"),
      "rgb(59, 130, 246)",
      `${page}: primary action`,
    )
    assert.equal(
      await paint(".button.primary", "color"),
      "rgb(11, 17, 32)",
      `${page}: contrast-safe action label`,
    )
    assert.equal(
      await paint(".page-heading p", "color"),
      "rgb(168, 181, 199)",
      `${page}: secondary text`,
    )
  }
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const loaded = new Promise((resolve) => {
    pageLoaded = resolve
  })
  await send("Page.navigate", {
    url: `${appURL}${
      appURL.includes("?") ? "&" : "?"
    }resqBrowserTest=${Date.now()}`,
  })
  await loaded
  await wait('!!document.querySelector(".map-marker")')
  await selected("RQ-1042")
  for (const page of [
    "Overview",
    "Live Operations",
    "Relief Requests",
    "Resource Inventory",
    "Allocation & Dispatch",
    "Unmet Needs",
    "Analytics",
    "Settings",
  ]) {
    await navigate(page)
    await checkTheme(page)
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
      `Desktop overflow: ${page}`,
    )
  }
  await navigate("Overview")
  await evaluate("window.scrollTo(0,0)")
  await screen("midnight-command-desktop")
  for (const [marker, legend, color] of [
    [".map-marker.critical", ".legend-dot.red", "rgb(240, 68, 82)"],
    [".map-marker.high", ".legend-dot.amber", "rgb(255, 176, 32)"],
    [".map-marker.medium", ".legend-dot.medium", "rgb(56, 189, 248)"],
  ]) {
    assert.equal(await paint(marker, "backgroundColor"), color)
    assert.equal(await paint(legend, "backgroundColor"), color)
  }
  assert.equal(
    await paint(".facility.center", "color"),
    await paint(".legend-square", "backgroundColor"),
  )
  assert.equal(
    await paint(".facility.shelter", "color"),
    await paint(".legend-shelter", "color"),
  )
  assert.equal(await paint(".facility.shelter", "color"), "rgb(34, 197, 94)")
  assert.equal(await paint(".badge.verified", "color"), "rgb(34, 197, 94)")
  assert.equal(
    await paint(".map-marker.selected", "outlineColor"),
    "rgb(248, 250, 252)",
  )
  assert.notEqual(await paint(".map-marker.selected", "boxShadow"), "none")
  assert.equal(
    await paint('[aria-label="Zoom out"]', "color"),
    "rgb(100, 116, 139)",
  )
  console.log(
    "PASS Midnight Command computed colors on all eight desktop screens; marker/legend consistency, success, selection and disabled states",
  )
  await click('.map-marker[aria-label^="RQ-1044,"]')
  await selected("RQ-1044")
  await clickText("View full details", 'document.querySelector(".map-context")')
  assert.ok(
    await evaluate(
      'document.querySelector("[role=dialog]").textContent.includes("Medical Supplies")',
    ),
  )
  await click('[aria-label="Close dialog"]')
  await selected("RQ-1044")
  await click('.queue-panel [data-request-id="RQ-1043"] .request-id')
  await selected("RQ-1043")
  console.log(
    "PASS request marker ↔ queue selection, contextual card, full details, and selection persistence",
  )

  await set('[aria-label="Map priority"]', "Critical")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    2,
  )
  await set('[aria-label="Map resource"]', "Medical Supplies")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    1,
  )
  await set('[aria-label="Map request status"]', "Submitted")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    0,
  )
  await reset()
  await set('[aria-label="Map location"]', "Zone C")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    1,
  )
  assert.ok(
    await evaluate(
      'document.querySelector(".map-filter-summary").textContent.includes("Zone C")',
    ),
  )
  await click('.queue-panel [data-request-id="RQ-1042"] .request-id')
  await selected("RQ-1042")
  assert.equal(
    await evaluate(
      "document.querySelector(\"[aria-label='Map location']\").value",
    ),
    "All locations",
  )
  console.log(
    "PASS priority, resource, status, location filters; queue selection reveals filtered markers",
  )

  await click(".layer-picker summary")
  const layerChecks = [
    ["Relief requests", ".map-marker"],
    ["Distribution centers", ".facility.center"],
    ["Shelters", ".facility.shelter"],
    ["Affected areas", ".selectable-area"],
  ]
  for (const [label, selector] of layerChecks) {
    await click(`[aria-label="${label} layer"]`)
    assert.equal(
      await evaluate(
        `document.querySelectorAll(${JSON.stringify(selector)}).length`,
      ),
      0,
    )
  }
  assert.ok(
    await evaluate(
      'document.querySelector(".map-empty").textContent.includes("No map elements")',
    ),
  )
  await reset()
  await click(".layer-picker summary")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    4,
  )
  assert.equal(
    await evaluate('document.querySelectorAll(".facility.center").length'),
    3,
  )
  console.log("PASS all four layer toggles, map empty state and reset")

  await minimize()
  await click('.facility.center[aria-label^="Distribution center DC-01:"]')
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("Central distribution center")',
    ),
  )
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("620")',
    ),
  )
  await clickText(
    "View center inventory",
    'document.querySelector(".map-context")',
  )
  assert.equal(
    await evaluate(
      "document.querySelector(\"[aria-label='Inventory category']\").value",
    ),
    "Drinking Water",
  )
  await navigate("Overview")
  await minimize()
  await click(".facility.shelter")
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("Current occupancy")',
    ),
  )
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("350")',
    ),
  )
  await minimize()
  await click('[aria-label="Affected area Zone A"]')
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("180")',
    ),
  )
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("Temporary Shelter")',
    ),
  )
  await clickExpression(
    '[...document.querySelectorAll(".area-request-links button")].find(e=>e.textContent.includes("RQ-1045"))',
  )
  await selected("RQ-1045")
  await click('[aria-label="Shortage RQ-1044: 40 units"]')
  await selected("RQ-1044")
  console.log(
    "PASS record-backed distribution center, inventory link, shelter, affected area and shortage selection",
  )

  await reset()
  await minimize()
  await click('[aria-label="Zoom in"]')
  await click('[aria-label="Zoom in"]')
  assert.equal(
    await evaluate(
      "document.querySelector(\"[aria-label='Map zoom level']\").textContent",
    ),
    "150%",
  )
  const before = await evaluate(
    'document.querySelector(".map-world").style.transform',
  )
  const point = await evaluate(
    '(()=>{const r=document.querySelector(".map-surface").getBoundingClientRect();return {x:r.left+25,y:r.bottom-50}})()',
  )
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  })
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    button: "left",
    buttons: 1,
    x: point.x + 100,
    y: point.y - 45,
  })
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    x: point.x + 100,
    y: point.y - 45,
  })
  assert.notEqual(
    await evaluate('document.querySelector(".map-world").style.transform'),
    before,
  )
  await reset()
  assert.ok(
    await evaluate(
      'document.querySelector(".map-world").style.transform.includes("translate(0px, 0px) scale(1)")',
    ),
  )
  await click('[aria-label="Zoom in"]')
  await evaluate('document.querySelector(".map-surface").focus()')
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
  })
  assert.ok(
    await evaluate(
      '!document.querySelector(".map-world").style.transform.startsWith("translate(0px, 0px)")',
    ),
  )
  await reset()
  console.log("PASS zoom, bounded pointer pan, keyboard pan and viewport reset")

  await click('.map-marker[aria-label^="RQ-1042,"]')
  await clickText(
    "Open allocation & dispatch",
    'document.querySelector(".map-context")',
  )
  const waterCard =
    '[...document.querySelectorAll(".allocation-card")].find(e=>e.textContent.includes("RQ-1042"))'
  await clickText("Review allocation", waterCard)
  await set('[name="quantity"]', "621")
  assert.equal(
    await evaluate('document.querySelector("[name=quantity]").checkValidity()'),
    false,
  )
  await clickText("Confirm allocation")
  assert.equal(
    await evaluate('document.querySelectorAll("[role=dialog]").length'),
    1,
  )
  await set('[name="quantity"]', "100")
  await set('[name="team"]', "Alpha · Ground relief")
  await clickText("Confirm allocation")
  await wait('!document.querySelector("[role=dialog]")')
  await navigate("Overview")
  await selected("RQ-1042")
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("Allocated")',
    ),
  )
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll(".metric-value")].map(e=>e.textContent.trim())',
    ),
    ["4", "2", "3", "1,120units"],
  )
  assert.ok(
    await evaluate(
      'document.querySelector(".activity-timeline").textContent.includes("Allocation confirmed")',
    ),
  )
  await minimize()
  await click('.facility.center[aria-label^="Distribution center DC-01:"]')
  assert.ok(
    await evaluate(
      'document.querySelector(".map-context").textContent.includes("520")',
    ),
  )
  console.log(
    "PASS map → allocation, stock limits, explicit partial confirmation, updated inventory, queue, metrics and activity",
  )

  await navigate("Overview")
  await click('.queue-panel [data-request-id="RQ-1044"] .request-id')
  await evaluate(
    'document.querySelector(".map-view-stack").scrollIntoView({block:"start"})',
  )
  await screen("desktop-workspace")
  const bounds = await evaluate(
    '(()=>{const m=document.querySelector(".map-surface").getBoundingClientRect(),c=document.querySelector(".map-context").getBoundingClientRect();return c.left>=m.left&&c.right<=m.right+1&&c.top>=m.top&&c.bottom<=m.bottom+1})()',
  )
  assert.equal(bounds, true, "Desktop context card must stay inside the map")
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  )
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await evaluate("window.scrollTo(0,0)")
  await screen("midnight-command-mobile")
  await pause(100)
  await click('.queue-panel [data-request-id="RQ-1043"] .request-id')
  await selected("RQ-1043")
  assert.ok(
    await evaluate(
      '(()=>{const m=document.querySelector(".map-surface").getBoundingClientRect(),c=document.querySelector(".map-context").getBoundingClientRect();return c.top>=m.bottom-1})()',
    ),
    "Mobile card must be below the map, not covering it",
  )
  await evaluate(
    'document.querySelector(".map-view-stack").scrollIntoView({block:"start"})',
  )
  await screen("mobile-workspace")
  await clickText("View full details", 'document.querySelector(".map-context")')
  assert.ok(
    await evaluate(
      'document.querySelector("[role=dialog]").textContent.includes("RQ-1043")',
    ),
  )
  await click('[aria-label="Close dialog"]')
  await selected("RQ-1043")
  await reset()
  await click('[aria-label="Zoom in"]')
  await evaluate(
    'document.querySelector(".map-surface").scrollIntoView({block:"start"})',
  )
  const touch = await evaluate(
    '(()=>{const r=document.querySelector(".map-surface").getBoundingClientRect();return {x:r.left+20,y:r.bottom-70}})()',
  )
  const oldTransform = await evaluate(
    'document.querySelector(".map-world").style.transform',
  )
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch],
  })
  await send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touch.x + 30, y: touch.y - 20 }],
  })
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  assert.notEqual(
    await evaluate('document.querySelector(".map-world").style.transform'),
    oldTransform,
  )
  await reset()
  for (const page of [
    "Relief Requests",
    "Resource Inventory",
    "Allocation & Dispatch",
    "Unmet Needs",
    "Analytics",
    "Settings",
    "Live Operations",
    "Overview",
  ]) {
    await navigate(page)
    await checkTheme(page)
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
      `Mobile overflow: ${page}`,
    )
  }
  for (let i = 0; i < 3; i++) {
    await clickText("New Relief Request")
    await set('[name="name"]', `Demo coordinator ${i}`)
    await set('[name="contact"]', "+91 98765 43210")
    await set('[name="zone"]', "Zone D")
    await set('[name="quantity"]', "1")
    await set('[name="people"]', "1")
    await set('[name="priority"]', "Low")
    await set(
      'textarea[name="description"]',
      "Illustrative map synchronization test.",
    )
    await clickText("Submit request")
    await click('[aria-label="Close dialog"]')
    await selected(`RQ-${1046 + i}`)
  }
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".queue-panel tr[data-request-id]").length',
    ),
    7,
  )
  assert.ok(
    await evaluate(
      '(()=>{const c=document.querySelector(".queue-panel .table-wrap").getBoundingClientRect(),r=document.querySelector(".selected-request-row").getBoundingClientRect();return r.top>=c.top-1&&r.bottom<=c.bottom+1})()',
    ),
    "The selected late-arriving request must scroll into the queue viewport",
  )
  await set('[aria-label="Map priority"]', "Low")
  assert.equal(
    await evaluate('document.querySelectorAll(".map-marker").length'),
    3,
  )
  assert.equal(
    await paint(".map-marker.low", "backgroundColor"),
    "rgb(148, 163, 184)",
  )
  assert.equal(
    await paint(".legend-dot.low", "backgroundColor"),
    "rgb(148, 163, 184)",
  )
  assert.equal(
    await evaluate('document.querySelectorAll(".selectable-area").length'),
    1,
  )
  await reset()
  console.log(
    "PASS new request records, Low priority, new affected area and queue scrolling beyond four rows",
  )
  assert.deepEqual(errors, [])
  console.log(
    "PASS desktop card bounds, mobile bottom drawer, mobile selection/touch pan, all navigation and mobile overflow; no runtime exceptions",
  )
  console.log(`Screenshots: ${screenshots}`)
} finally {
  // Close Chromium gracefully so its profile writers finish before cleanup.
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ id: -1, method: "Browser.close" }))
  else browser.kill("SIGTERM")
  const fallback = setTimeout(() => browser.kill("SIGTERM"), 3000)
  await new Promise((resolve) => {
    if (browser.exitCode !== null) resolve()
    else browser.once("exit", resolve)
  })
  clearTimeout(fallback)
  ws?.close()
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}
