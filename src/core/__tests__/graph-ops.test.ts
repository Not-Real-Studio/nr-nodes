import { describe, it, expect } from 'vitest'
import {
  createEmptyGraph,
  addNode, removeNode, updateNode, updateNodeData, moveNode,
  addConnection, removeConnection, getConnections, getPortConnections,
  topologicalSort,
} from '../graph-ops'
import { NodeRegistry } from '../registry'
import type { NodeDef, GraphNode, NodeGraph } from '../types'

// --- Helpers ---

function makeRegistry(): NodeRegistry {
  const reg = new NodeRegistry()
  reg.register({
    type: 'source',
    displayName: 'Source',
    ports: [{ id: 'output', name: 'output', direction: 'out', type: 'data' }],
  })
  reg.register({
    type: 'processor',
    displayName: 'Processor',
    ports: [
      { id: 'input', name: 'input', direction: 'in', type: 'data' },
      { id: 'output', name: 'output', direction: 'out', type: 'data' },
    ],
  })
  reg.register({
    type: 'sink',
    displayName: 'Sink',
    ports: [{ id: 'input', name: 'input', direction: 'in', type: 'data' }],
  })
  reg.register({
    type: 'multi_sink',
    displayName: 'Multi Sink',
    ports: [{ id: 'input', name: 'input', direction: 'in', type: 'data', multiple: true }],
  })
  return reg
}

function makeNode(id: string, type: string): GraphNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} }
}

function buildGraph(): NodeGraph {
  let graph = createEmptyGraph('test')
  ;[graph] = addNode(graph, makeNode('a', 'source'))
  ;[graph] = addNode(graph, makeNode('b', 'processor'))
  ;[graph] = addNode(graph, makeNode('c', 'sink'))
  return graph
}

// --- Tests ---

describe('createEmptyGraph', () => {
  it('creates empty graph with name', () => {
    const g = createEmptyGraph('My Graph')
    expect(g.name).toBe('My Graph')
    expect(g.nodes).toEqual([])
    expect(g.connections).toEqual([])
    expect(g.version).toBe(2)
  })
})

describe('addNode', () => {
  it('adds a node and returns its id', () => {
    const g = createEmptyGraph()
    const node = makeNode('n1', 'source')
    const [newG, id] = addNode(g, node)
    expect(id).toBe('n1')
    expect(newG.nodes).toHaveLength(1)
    expect(newG.nodes[0]).toBe(node)
  })

  it('is immutable', () => {
    const g = createEmptyGraph()
    const [newG] = addNode(g, makeNode('n1', 'source'))
    expect(g.nodes).toHaveLength(0)
    expect(newG.nodes).toHaveLength(1)
  })
})

describe('removeNode', () => {
  it('removes node and its connections', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    ;[g] = addConnection(g, { node: 'b', port: 'output' }, { node: 'c', port: 'input' }, reg)

    const newG = removeNode(g, 'b')
    expect(newG.nodes).toHaveLength(2)
    expect(newG.nodes.find(n => n.id === 'b')).toBeUndefined()
    expect(newG.connections).toHaveLength(0) // both connections involved 'b'
  })
})

describe('updateNode', () => {
  it('merges updates into node', () => {
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('n1', 'source'))
    const newG = updateNode(g, 'n1', { name: 'My Source' })
    expect(newG.nodes[0].name).toBe('My Source')
    expect(newG.nodes[0].id).toBe('n1') // id preserved
  })
})

describe('updateNodeData', () => {
  it('merges data into node data', () => {
    let g = createEmptyGraph()
    ;[g] = addNode(g, { ...makeNode('n1', 'source'), data: { a: 1 } })
    const newG = updateNodeData(g, 'n1', { b: 2 })
    expect(newG.nodes[0].data).toEqual({ a: 1, b: 2 })
  })
})

describe('moveNode', () => {
  it('updates position', () => {
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('n1', 'source'))
    const newG = moveNode(g, 'n1', { x: 100, y: 200 })
    expect(newG.nodes[0].position).toEqual({ x: 100, y: 200 })
  })
})

describe('addConnection', () => {
  it('adds valid connection', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    const [newG, connId] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    expect(connId).toBeTruthy()
    expect(newG.connections).toHaveLength(1)
    expect(newG.connections[0].from).toEqual({ node: 'a', port: 'output' })
    expect(newG.connections[0].to).toEqual({ node: 'b', port: 'input' })
  })

  it('rejects self-connection', () => {
    const reg = makeRegistry()
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('a', 'processor'))
    const [newG, connId] = addConnection(g, { node: 'a', port: 'output' }, { node: 'a', port: 'input' }, reg)
    expect(connId).toBeNull()
    expect(newG.connections).toHaveLength(0)
  })

  it('replaces existing connection on non-multiple port', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    // Add a second source
    ;[g] = addNode(g, makeNode('a2', 'source'))

    // Connect a -> b
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    expect(g.connections).toHaveLength(1)

    // Connect a2 -> b (should replace a -> b since input is not multiple)
    ;[g] = addConnection(g, { node: 'a2', port: 'output' }, { node: 'b', port: 'input' }, reg)
    expect(g.connections).toHaveLength(1)
    expect(g.connections[0].from.node).toBe('a2')
  })

  it('allows multiple connections on multiple port', () => {
    const reg = makeRegistry()
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('a', 'source'))
    ;[g] = addNode(g, makeNode('a2', 'source'))
    ;[g] = addNode(g, makeNode('m', 'multi_sink'))

    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'm', port: 'input' }, reg)
    ;[g] = addConnection(g, { node: 'a2', port: 'output' }, { node: 'm', port: 'input' }, reg)
    expect(g.connections).toHaveLength(2)
  })

  it('prevents duplicate connections on multiple port', () => {
    const reg = makeRegistry()
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('a', 'source'))
    ;[g] = addNode(g, makeNode('m', 'multi_sink'))
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'm', port: 'input' }, reg)
    const [newG, connId] = addConnection(g, { node: 'a', port: 'output' }, { node: 'm', port: 'input' }, reg)
    expect(connId).toBeNull()
    expect(newG.connections).toHaveLength(1)
  })
})

describe('removeConnection', () => {
  it('removes connection by id', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    let connId: string | null
    ;[g, connId] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    const newG = removeConnection(g, connId!)
    expect(newG.connections).toHaveLength(0)
  })
})

describe('getConnections', () => {
  it('gets all connections for a node', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    ;[g] = addConnection(g, { node: 'b', port: 'output' }, { node: 'c', port: 'input' }, reg)

    expect(getConnections(g, 'b')).toHaveLength(2)
    expect(getConnections(g, 'b', 'in')).toHaveLength(1)
    expect(getConnections(g, 'b', 'out')).toHaveLength(1)
    expect(getConnections(g, 'a', 'in')).toHaveLength(0)
  })
})

describe('getPortConnections', () => {
  it('gets connections to specific port', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    expect(getPortConnections(g, 'b', 'input')).toHaveLength(1)
    expect(getPortConnections(g, 'b', 'output')).toHaveLength(0)
  })
})

describe('topologicalSort', () => {
  it('sorts a DAG correctly', () => {
    const reg = makeRegistry()
    let g = buildGraph()
    ;[g] = addConnection(g, { node: 'a', port: 'output' }, { node: 'b', port: 'input' }, reg)
    ;[g] = addConnection(g, { node: 'b', port: 'output' }, { node: 'c', port: 'input' }, reg)

    const sorted = topologicalSort(g)
    expect(sorted).not.toBeNull()
    expect(sorted!.indexOf('a')).toBeLessThan(sorted!.indexOf('b'))
    expect(sorted!.indexOf('b')).toBeLessThan(sorted!.indexOf('c'))
  })

  it('returns null on cycle', () => {
    // Create a cycle manually
    const g: NodeGraph = {
      version: 2,
      name: 'cyclic',
      nodes: [
        makeNode('a', 'processor'),
        makeNode('b', 'processor'),
      ],
      connections: [
        { id: 'c1', from: { node: 'a', port: 'output' }, to: { node: 'b', port: 'input' } },
        { id: 'c2', from: { node: 'b', port: 'output' }, to: { node: 'a', port: 'input' } },
      ],
    }
    expect(topologicalSort(g)).toBeNull()
  })

  it('handles disconnected nodes', () => {
    let g = createEmptyGraph()
    ;[g] = addNode(g, makeNode('a', 'source'))
    ;[g] = addNode(g, makeNode('b', 'source'))
    const sorted = topologicalSort(g)
    expect(sorted).toHaveLength(2)
  })
})
