import { describe, it, expect } from 'vitest'
import { validateConnection, getNodePorts, findPort } from '../validation.js'
import { NodeRegistry } from '../registry.js'
import type { NodeGraph, PortDef } from '../types.js'

function makeRegistry(): NodeRegistry {
  const reg = new NodeRegistry()
  reg.register({
    type: 'source',
    displayName: 'Source',
    ports: [{ id: 'output', name: 'output', direction: 'out', type: 'data' }],
  })
  reg.register({
    type: 'sink',
    displayName: 'Sink',
    ports: [{ id: 'input', name: 'input', direction: 'in', type: 'data' }],
  })
  reg.register({
    type: 'typed_source',
    displayName: 'Typed Source',
    ports: [{ id: 'output', name: 'output', direction: 'out', type: 'string' }],
  })
  reg.register({
    type: 'typed_sink',
    displayName: 'Typed Sink',
    ports: [{ id: 'input', name: 'input', direction: 'in', type: 'number' }],
  })
  reg.register({
    type: 'any_sink',
    displayName: 'Any Sink',
    ports: [{ id: 'input', name: 'input', direction: 'in', type: 'any' }],
  })
  reg.register({
    type: 'dynamic',
    displayName: 'Dynamic',
    ports: [{ id: 'output', name: 'output', direction: 'out' }],
    dynamicPorts: (data) => {
      const count = (data.inputCount as number) || 1
      return Array.from({ length: count }, (_, i): PortDef => ({
        id: `in_${i}`,
        name: `input ${i}`,
        direction: 'in',
        type: 'data',
      }))
    },
  })
  return reg
}

const graph: NodeGraph = {
  version: 2,
  name: 'test',
  nodes: [
    { id: 'src', type: 'source', position: { x: 0, y: 0 }, data: {} },
    { id: 'snk', type: 'sink', position: { x: 100, y: 0 }, data: {} },
    { id: 'ts', type: 'typed_source', position: { x: 0, y: 100 }, data: {} },
    { id: 'tn', type: 'typed_sink', position: { x: 100, y: 100 }, data: {} },
    { id: 'as', type: 'any_sink', position: { x: 200, y: 0 }, data: {} },
    { id: 'dyn', type: 'dynamic', position: { x: 200, y: 100 }, data: { inputCount: 2 } },
  ],
  connections: [],
}

describe('validateConnection', () => {
  const reg = makeRegistry()

  it('valid connection', () => {
    const result = validateConnection(graph, { node: 'src', port: 'output' }, { node: 'snk', port: 'input' }, reg)
    expect(result.valid).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it('rejects self-connection', () => {
    const result = validateConnection(graph, { node: 'src', port: 'output' }, { node: 'src', port: 'output' }, reg)
    expect(result.valid).toBe(false)
  })

  it('rejects wrong direction (in → in)', () => {
    const result = validateConnection(graph, { node: 'snk', port: 'input' }, { node: 'tn', port: 'input' }, reg)
    expect(result.valid).toBe(false)
  })

  it('type mismatch gives warning, not error', () => {
    const result = validateConnection(graph, { node: 'ts', port: 'output' }, { node: 'tn', port: 'input' }, reg)
    expect(result.valid).toBe(true) // warning, not error
    expect(result.message).toContain('Type mismatch')
  })

  it('any type matches everything', () => {
    const result = validateConnection(graph, { node: 'ts', port: 'output' }, { node: 'as', port: 'input' }, reg)
    expect(result.valid).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it('rejects unknown port', () => {
    const result = validateConnection(graph, { node: 'src', port: 'nonexistent' }, { node: 'snk', port: 'input' }, reg)
    expect(result.valid).toBe(false)
  })
})

describe('getNodePorts', () => {
  const reg = makeRegistry()

  it('returns static ports', () => {
    const ports = getNodePorts(graph, 'src', reg)
    expect(ports).toHaveLength(1)
    expect(ports[0].id).toBe('output')
  })

  it('includes dynamic ports', () => {
    const ports = getNodePorts(graph, 'dyn', reg)
    // 1 static (output) + 2 dynamic (in_0, in_1)
    expect(ports).toHaveLength(3)
  })
})

describe('findPort', () => {
  const reg = makeRegistry()

  it('finds existing port', () => {
    const port = findPort(graph, { node: 'src', port: 'output' }, reg)
    expect(port).toBeDefined()
    expect(port!.direction).toBe('out')
  })

  it('returns undefined for unknown port', () => {
    const port = findPort(graph, { node: 'src', port: 'nonexistent' }, reg)
    expect(port).toBeUndefined()
  })
})
