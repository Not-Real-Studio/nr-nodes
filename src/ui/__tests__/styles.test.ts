import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles/nodes.css', import.meta.url), 'utf8')
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g

/** The one variables block: on the component roots, declares every --nn-* the styles use. */
function splitVarsBlock(text: string): { vars: string; rest: string } {
  const start = text.indexOf('.nn-canvas,\n.nn-inspector,\n.nn-toolbar {')
  expect(start, 'variables block on the component roots').toBeGreaterThanOrEqual(0)
  const end = text.indexOf('}', start)
  return { vars: text.slice(start, end + 1), rest: text.slice(0, start) + text.slice(end + 1) }
}

describe('nodes.css on host theme tokens', () => {
  const { vars, rest } = splitVarsBlock(css.replace(/\/\*[\s\S]*?\*\//g, ''))

  it('no colour literals outside the variables block', () => {
    expect(rest.match(COLOR_LITERAL) ?? []).toEqual([])
  })

  it('every --nn-* variable reads an --nr-* token (literal only as its fallback)', () => {
    const decls = [...vars.matchAll(/(--nn-[\w-]+):\s*([^;]+);/g)]
    expect(decls.length).toBeGreaterThan(10)
    for (const [, name, value] of decls) {
      if (name === '--nn-shadow') continue // shadow colour is not a theme token
      expect(value, name).toMatch(/var\(--nr-[\w-]+/)
    }
  })

  it('every --nn-* used is declared', () => {
    const declared = new Set([...vars.matchAll(/(--nn-[\w-]+):/g)].map((m) => m[1]))
    declared.add('--nn-group-color') // per-group, set on .nn-group / inline
    const used = new Set([...rest.matchAll(/var\((--nn-[\w-]+)/g)].map((m) => m[1]))
    for (const name of used) expect(declared.has(name), name).toBe(true)
  })
})
