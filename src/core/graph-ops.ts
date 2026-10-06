import type { NodeGraph, GraphNode, Connection, PortRef, Position } from './types'
import type { NodeRegistry } from './registry'
import { generateId } from './id'
import { validateConnection } from './validation'

// ============================================================================
// Empty graph
// ============================================================================

export function createEmptyGraph(name = 'Untitled'): NodeGraph {
  return { version: 2, name, nodes: [], connections: [] }
}

// ============================================================================
// Node operations
// ============================================================================

/** Add a node. Returns [new graph, node id]. */
export function addNode(graph: NodeGraph, node: GraphNode): [NodeGraph, string] {
  return [
    { ...graph, nodes: [...graph.nodes, node] },
    node.id,
  ]
}

/** Remove a node and all its connections. */
export function removeNode(graph: NodeGraph, nodeId: string): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    connections: graph.connections.filter(
      c => c.from.node !== nodeId && c.to.node !== nodeId,
    ),
  }
}

/** Update a node (partial merge). */
export function updateNode(graph: NodeGraph, nodeId: string, updates: Partial<GraphNode>): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, ...updates, id: n.id } : n,
    ),
  }
}

/** Update node data (merge into data). */
export function updateNodeData(graph: NodeGraph, nodeId: string, data: Record<string, unknown>): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
    ),
  }
}

/** Move a node. */
export function moveNode(graph: NodeGraph, nodeId: string, position: Position): NodeGraph {
  return updateNode(graph, nodeId, { position })
}

// ============================================================================
// Connection operations
// ============================================================================

/** Add a connection. If target port is not multiple, replaces existing.
 *  Returns [new graph, connection id] or [graph, null] on validation failure. */
export function addConnection(
  graph: NodeGraph,
  from: PortRef,
  to: PortRef,
  registry: NodeRegistry,
): [NodeGraph, string | null] {
  const validation = validateConnection(graph, from, to, registry)
  if (!validation.valid) return [graph, null]

  // If target port is not multiple, remove existing connections to it
  const def = registry.get(graph.nodes.find(n => n.id === to.node)?.type ?? '')
  let ports = def?.ports ?? []
  if (def?.dynamicPorts) {
    const node = graph.nodes.find(n => n.id === to.node)
    if (node) ports = [...ports, ...def.dynamicPorts(node.data)]
  }
  const toPortDef = ports.find(p => p.id === to.port)

  let connections = graph.connections
  if (!toPortDef?.multiple) {
    connections = connections.filter(
      c => !(c.to.node === to.node && c.to.port === to.port),
    )
  }

  // Prevent duplicate connections
  const exists = connections.some(
    c => c.from.node === from.node && c.from.port === from.port &&
         c.to.node === to.node && c.to.port === to.port,
  )
  if (exists) return [graph, null]

  const id = generateId()
  const conn: Connection = { id, from, to }

  return [{ ...graph, connections: [...connections, conn] }, id]
}

/** Remove a connection. */
export function removeConnection(graph: NodeGraph, connectionId: string): NodeGraph {
  return {
    ...graph,
    connections: graph.connections.filter(c => c.id !== connectionId),
  }
}

/** Get all connections to/from a node. */
export function getConnections(graph: NodeGraph, nodeId: string, direction?: 'in' | 'out'): Connection[] {
  return graph.connections.filter(c => {
    if (direction === 'in') return c.to.node === nodeId
    if (direction === 'out') return c.from.node === nodeId
    return c.from.node === nodeId || c.to.node === nodeId
  })
}

/** Get connections to a specific port. */
export function getPortConnections(graph: NodeGraph, nodeId: string, portId: string): Connection[] {
  return graph.connections.filter(
    c => (c.from.node === nodeId && c.from.port === portId) ||
         (c.to.node === nodeId && c.to.port === portId),
  )
}

// ============================================================================
// Topological sort
// ============================================================================

/** Topological sort. Returns null if cycle detected. */
export function topologicalSort(graph: NodeGraph): string[] | null {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0)
    adj.set(node.id, [])
  }

  for (const conn of graph.connections) {
    const from = conn.from.node
    const to = conn.to.node
    adj.get(from)!.push(to)
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const result: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    result.push(id)
    for (const next of adj.get(id)!) {
      const deg = inDegree.get(next)! - 1
      inDegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }

  return result.length === graph.nodes.length ? result : null
}
