import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
const palette = {
  bg: "#0B1120",
  sidebar: "#101A2C",
  panel: "#172438",
  elevated: "#202F45",
  line: "#34445A",
  accent: "#3B82F6",
  red: "#F04452",
  amber: "#FFB020",
  medium: "#38BDF8",
  low: "#94A3B8",
  success: "#22C55E",
  text: "#F8FAFC",
  muted: "#A8B5C7",
  disabled: "#64748B",
}
const rgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const mix = (a, b, weight) => a.map((x, i) => x * weight + b[i] * (1 - weight))
const luminance = (color) =>
  color
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05)
const colors = Object.fromEntries(
  Object.entries(palette).map(([name, hex]) => [name, rgb(hex)]),
)

test("all fourteen Midnight Command foundation colors are centralized exactly", () => {
  for (const [name, value] of Object.entries(palette))
    assert.ok(css.includes(`--${name}:${value};`), name)
  const literals = css.match(/#[0-9a-f]{3,8}\b/gi)
  assert.equal(
    literals.length,
    14,
    "Component colors must refer to tokens, not legacy literals",
  )
})
test("primary and secondary text meet AA contrast on all main surfaces", () => {
  for (const surface of ["bg", "sidebar", "panel", "elevated"]) {
    for (const ink of ["text", "muted"])
      assert.ok(
        contrast(colors[ink], colors[surface]) >= 4.5,
        `${ink} on ${surface}`,
      )
  }
  assert.ok(
    contrast(colors.bg, colors.accent) >= 4.5,
    "Dark primary-action labels on exact action blue",
  )
})
test("derived critical and interactive inks keep small text readable", () => {
  for (const [color, weight] of [
    ["red", 0.78],
    ["accent", 0.72],
  ]) {
    const ink = mix(colors[color], colors.text, weight)
    const tint = mix(colors[color], colors.panel, 0.12)
    assert.ok(contrast(ink, tint) >= 4.5, `${color} tinted badge`)
    assert.ok(
      contrast(ink, colors.elevated) >= 4.5,
      `${color} text on elevated card`,
    )
  }
  for (const [color, weight] of [
    ["amber", 0.1],
    ["medium", 0.1],
    ["success", 0.1],
  ]) {
    assert.ok(
      contrast(colors[color], mix(colors[color], colors.panel, weight)) >= 4.5,
      `${color} badge`,
    )
  }
  assert.ok(contrast(colors.low, colors.bg) >= 4.5)
})
test("control outlines and map icon/marker colors meet non-text contrast", () => {
  assert.ok(
    contrast(mix(colors.disabled, colors.muted, 0.8), colors.elevated) >= 3,
  )
  for (const color of ["red", "amber", "medium", "low", "accent", "success"]) {
    assert.ok(
      contrast(colors[color], colors.sidebar) >= 3,
      `${color} marker against map`,
    )
  }
  assert.ok(
    contrast(colors.accent, mix(colors.accent, colors.panel, 0.12)) >= 3,
  )
  assert.ok(
    contrast(colors.success, mix(colors.success, colors.panel, 0.1)) >= 3,
  )
})
test("map SVG paints use shared tokens and completion is green rather than interaction blue", () => {
  const terrain = readFileSync(
    new URL("../src/MapTerrain.tsx", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(terrain, /(?:fill|stroke)="#[0-9a-f]+"/i)
  assert.match(
    css,
    /\.badge\.verified,\.badge\.fulfilled\{color:var\(--success\)/,
  )
  assert.match(css, /\.legend-dot\.medium\{background:var\(--medium\)/)
  assert.match(css, /\.legend-dot\.low\{background:var\(--low\)/)
  assert.match(
    css,
    /\.interactive-map \.map-marker\.selected\{outline:2px solid var\(--text\)/,
  )
})
