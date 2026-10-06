import { describe, it, expect } from 'vitest'
import { serializeGraph, deserializeGraph } from '../serialization'
import type { NodeGraph } from '../types'

describe('serialization', () => {
  const graph: NodeGraph = {
    version: 2,
    name: 'Test Graph',
    nodes: [
      { id: 'n1', type: 'source', position: { x: 10, y: 20 }, data: { items: ['a', 'b'] } },
      { id: 'n2', type: 'sink', position: { x: 200, y: 20 }, data: {} },
    ],
    connections: [
      { id: 'c1', from: { node: 'n1', port: 'output' }, to: { node: 'n2', port: 'input' } },
    ],
    meta: { author: 'test' },
  }

  it('round-trip preserves data', () => {
    const json = serializeGraph(graph)
    const restored = deserializeGraph(json)
    expect(restored.version).toBe(2)
    expect(restored.name).toBe('Test Graph')
    expect(restored.nodes).toHaveLength(2)
    expect(restored.connections).toHaveLength(1)
    expect(restored.nodes[0].data).toEqual({ items: ['a', 'b'] })
    expect(restored.meta).toEqual({ author: 'test' })
  })

  it('deserialize fills missing fields', () => {
    const minimal = '{}'
    const g = deserializeGraph(minimal)
    expect(g.version).toBe(2)
    expect(g.nodes).toEqual([])
    expect(g.connections).toEqual([])
  })

  it('serialize produces valid JSON', () => {
    const json = serializeGraph(graph)
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
