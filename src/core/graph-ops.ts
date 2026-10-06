import type { NodeGraph, GraphNode, GraphGroup, Connection, PortRef, Position } from './types.js'
import type { NodeRegistry } from './registry.js'
import { generateId } from './id.js'
import { validateConnection } from './validation.js'

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

/** Remove a node, all its connections and its group membership. */
export function removeNode(graph: NodeGraph, nodeId: string): NodeGraph {
  const next: NodeGraph = {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    connections: graph.connections.filter(
      c => c.from.node !== nodeId && c.to.node !== nodeId,
    ),
  }
  if (graph.groups) {
    next.groups = graph.groups.map(g =>
      g.nodes.includes(nodeId) ? { ...g, nodes: g.nodes.filter(id => id !== nodeId) } : g,
    )
  }
  return next
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

/** Move several nodes by the same offset. */
export function moveNodes(graph: NodeGraph, nodeIds: string[], delta: Position): NodeGraph {
  const ids = new Set(nodeIds)
  return {
    ...graph,
    nodes: graph.nodes.map(n =>
      ids.has(n.id)
        ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
        : n,
    ),
  }
}

// ============================================================================
// Group operations
// ============================================================================

/** Keep only existing, unique node ids. */
function cleanMembers(graph: NodeGraph, nodeIds: string[]): string[] {
  const existing = new Set(graph.nodes.map(n => n.id))
  return [...new Set(nodeIds)].filter(id => existing.has(id))
}

/** Assign `members` to group `groupId`, removing them from any other group. */
function withMembers(groups: GraphGroup[], groupId: string, members: string[]): GraphGroup[] {
  const taken = new Set(members)
  return groups.map(g =>
    g.id === groupId
      ? { ...g, nodes: members }
      : g.nodes.some(id => taken.has(id))
        ? { ...g, nodes: g.nodes.filter(id => !taken.has(id)) }
        : g,
  )
}

/** Add a group. Listed nodes move into it from their previous groups.
 *  Returns [new graph, group id]. */
export function addGroup(
  graph: NodeGraph,
  group: { name: string; nodes?: string[]; color?: string },
): [NodeGraph, string] {
  const existing = new Set((graph.groups ?? []).map(g => g.id))
  let id = generateId()
  while (existing.has(id)) id = generateId()
  const created: GraphGroup = { id, name: group.name, nodes: [] }
  if (group.color !== undefined) created.color = group.color
  const members = cleanMembers(graph, group.nodes ?? [])
  return [
    { ...graph, groups: withMembers([...(graph.groups ?? []), created], id, members) },
    id,
  ]
}

/** Remove a group. Its nodes stay in the graph. */
export function removeGroup(graph: NodeGraph, groupId: string): NodeGraph {
  if (!graph.groups) return graph
  return { ...graph, groups: graph.groups.filter(g => g.id !== groupId) }
}

/** Update a group (partial merge). `nodes` in the patch replaces membership
 *  and moves those nodes out of other groups. */
export function updateGroup(
  graph: NodeGraph,
  groupId: string,
  patch: Partial<Omit<GraphGroup, 'id'>>,
): NodeGraph {
  const groups = graph.groups
  if (!groups?.some(g => g.id === groupId)) return graph
  let next = groups.map(g => (g.id === groupId ? { ...g, ...patch, id: g.id } : g))
  if (patch.nodes) next = withMembers(next, groupId, cleanMembers(graph, patch.nodes))
  return { ...graph, groups: next }
}

/** Put a node into a group (moving it out of its previous group), or out of any group with `null`. */
export function setNodeGroup(graph: NodeGraph, nodeId: string, groupId: string | null): NodeGraph {
  const groups = graph.groups ?? []
  if (!graph.nodes.some(n => n.id === nodeId)) return graph
  if (groupId === null) {
    if (!groups.some(g => g.nodes.includes(nodeId))) return graph
    return {
      ...graph,
      groups: groups.map(g =>
        g.nodes.includes(nodeId) ? { ...g, nodes: g.nodes.filter(id => id !== nodeId) } : g,
      ),
    }
  }
  const target = groups.find(g => g.id === groupId)
  if (!target) return graph
  if (target.nodes.includes(nodeId)) return graph
  return { ...graph, groups: withMembers(groups, groupId, [...target.nodes, nodeId]) }
}

/** Group containing the node, if any. */
export function getNodeGroup(graph: NodeGraph, nodeId: string): GraphGroup | undefined {
  return graph.groups?.find(g => g.nodes.includes(nodeId))
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
