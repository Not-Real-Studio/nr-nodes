import { describe, it, expect } from 'vitest'
import { layoutLayered, applyLayout } from '../layout.js'
import type { LayoutOptions } from '../layout.js'
import type { NodeGraph, GraphGroup, Position } from '../types.js'

function graph(ids: string[], edges: Array<[string, string]>, groups?: GraphGroup[]): NodeGraph {
  return {
    version: 2,
    name: 'L',
    nodes: ids.map(id => ({ id, type: 't', position: { x: 0, y: 0 }, data: {} })),
    connections: edges.map(([a, b], i) => ({
      id: `c${i}`, from: { node: a, port: 'out' }, to: { node: b, port: 'in' },
    })),
    ...(groups ? { groups } : {}),
  }
}

const W = 220, H = 120

function rects(pos: Record<string, Position>, w = W, h = H) {
  return Object.entries(pos).map(([id, p]) => ({ id, x: p.x, y: p.y, w, h }))
}

function overlapping(pos: Record<string, Position>, w = W, h = H): string[] {
  const rs = rects(pos, w, h)
  const bad: string[] = []
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j]
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(`${a.id}/${b.id}`)
  }
  return bad
}

// A pipeline-like DAG: two sources, a fan-out, a join, a long edge
const dagIds = ['s1', 's2', 'a', 'b', 'c', 'd', 'e', 'out']
const dagEdges: Array<[string, string]> = [
  ['s1', 'a'], ['s1', 'b'], ['s2', 'c'], ['a', 'd'], ['b', 'd'], ['c', 'e'],
  ['d', 'out'], ['e', 'out'], ['s2', 'out'],
]

describe('layoutLayered', () => {
  it('is deterministic', () => {
    const g = graph(dagIds, dagEdges)
    expect(layoutLayered(g)).toEqual(layoutLayered(g))
    expect(layoutLayered(g, { direction: 'TB' })).toEqual(layoutLayered(g, { direction: 'TB' }))
  })

  it('positions every node, starting at {0,0}', () => {
    const pos = layoutLayered(graph(dagIds, dagEdges))
    expect(Object.keys(pos).sort()).toEqual([...dagIds].sort())
    expect(Math.min(...Object.values(pos).map(p => p.x))).toBe(0)
    expect(Math.min(...Object.values(pos).map(p => p.y))).toBe(0)
  })

  it('node rectangles do not overlap (LR and TB, custom sizes)', () => {
    const g = graph(dagIds, dagEdges)
    expect(overlapping(layoutLayered(g))).toEqual([])
    expect(overlapping(layoutLayered(g, { direction: 'TB' }))).toEqual([])
    const opts: LayoutOptions = { nodeSize: () => ({ w: 300, h: 200 }), gapX: 10, gapY: 5 }
    expect(overlapping(layoutLayered(g, opts), 300, 200)).toEqual([])
  })

  it('every connection goes forward along the layer axis (acyclic graph)', () => {
    const g = graph(dagIds, dagEdges)
    const lr = layoutLayered(g)
    const tb = layoutLayered(g, { direction: 'TB' })
    for (const [a, b] of dagEdges) {
      expect(lr[b].x).toBeGreaterThan(lr[a].x)
      expect(tb[b].y).toBeGreaterThan(tb[a].y)
    }
  })

  it('longest path layering: join lands after the longest branch; isolated → layer 0', () => {
    const pos = layoutLayered(graph(['a', 'b', 'c', 'lonely'], [['a', 'b'], ['b', 'c'], ['a', 'c']]))
    expect(pos.a.x).toBe(0)
    expect(pos.b.x).toBe(W + 80)
    expect(pos.c.x).toBe(2 * (W + 80))
    expect(pos.lonely.x).toBe(0)
  })

  it('applies gaps: layers step by max width + gapX, nodes by height + gapY', () => {
    const pos = layoutLayered(graph(['a', 'b', 'c'], [['a', 'c'], ['b', 'c']]), { gapX: 10, gapY: 3 })
    expect(pos.c.x).toBe(W + 10)
    expect([pos.a.y, pos.b.y].sort((x, y) => x - y)).toEqual([0, H + 3])
  })

  it('terminates on cycles and keeps rectangles apart', () => {
    const g = graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'd']])
    const pos = layoutLayered(g)
    expect(Object.keys(pos)).toHaveLength(4)
    expect(overlapping(pos)).toEqual([])
    // the cycle-closing edge c→a is ignored: a is the source
    expect(pos.a.x).toBeLessThan(pos.b.x)
    expect(pos.b.x).toBeLessThan(pos.c.x)
    expect(pos.c.x).toBeLessThan(pos.d.x)
  })

  it('handles empty graphs and dangling connections', () => {
    expect(layoutLayered(graph([], []))).toEqual({})
    const pos = layoutLayered(graph(['a'], [['a', 'ghost'], ['ghost', 'a']]))
    expect(pos).toEqual({ a: { x: 0, y: 0 } })
  })

  it('keeps group members adjacent inside a layer', () => {
    // sources interleaved in graph order: x1 y1 x2 y2 x3 — groups X and Y
    const ids = ['x1', 'y1', 'x2', 'y2', 'x3', 'sink']
    const edges: Array<[string, string]> = ids.slice(0, 5).map(id => [id, 'sink'] as [string, string])
    const groups: GraphGroup[] = [
      { id: 'Y', name: 'Y', nodes: ['y1', 'y2'] },
      { id: 'X', name: 'X', nodes: ['x1', 'x2', 'x3'] },
    ]
    const pos = layoutLayered(graph(ids, edges, groups))
    const layer0 = ids.slice(0, 5).sort((a, b) => pos[a].y - pos[b].y)
    // group order in graph.groups: Y first, then X
    expect(layer0).toEqual(['y1', 'y2', 'x1', 'x2', 'x3'])
  })

  it('keeps groups contiguous after barycenter reordering', () => {
    // two "characters", each with source → step → step, ungrouped final sink
    const ids = ['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'end']
    const edges: Array<[string, string]> = [
      ['a1', 'a2'], ['a2', 'a3'], ['b1', 'b2'], ['b2', 'b3'], ['a3', 'end'], ['b3', 'end'], ['a1', 'b2'],
    ]
    const groups: GraphGroup[] = [
      { id: 'A', name: 'A', nodes: ['a1', 'a2', 'a3'] },
      { id: 'B', name: 'B', nodes: ['b1', 'b2', 'b3'] },
    ]
    const pos = layoutLayered(graph(ids, edges, groups))
    expect(overlapping(pos)).toEqual([])
    for (const [a, b] of [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']]) {
      expect(pos[a].x).toBe(pos[b].x) // same layer
      expect(pos[a].y).toBeLessThan(pos[b].y) // group A before group B
    }
  })

  it('does not throw on a bad nodeSize', () => {
    const g = graph(['a', 'b'], [['a', 'b']])
    const pos = layoutLayered(g, { nodeSize: () => { throw new Error('boom') } })
    expect(pos.b.x).toBe(W + 80)
  })
})

describe('applyLayout', () => {
  it('sets positions immutably, keeps unknown nodes in place', () => {
    const g = graph(['a', 'b'], [])
    g.nodes[1].position = { x: 5, y: 6 }
    const next = applyLayout(g, { a: { x: 1, y: 2 } })
    expect(next.nodes[0].position).toEqual({ x: 1, y: 2 })
    expect(next.nodes[1].position).toEqual({ x: 5, y: 6 })
    expect(g.nodes[0].position).toEqual({ x: 0, y: 0 })
  })
})
