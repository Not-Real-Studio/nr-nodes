import type { NodeGraph, PortRef, ConnectionValidationResult, PortDef } from './types'
import type { NodeRegistry } from './registry'

/** Get all ports for a node (static + dynamic) */
export function getNodePorts(graph: NodeGraph, nodeId: string, registry: NodeRegistry): PortDef[] {
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) return []

  const def = registry.get(node.type)
  if (!def) return []

  const ports = [...def.ports]
  if (def.dynamicPorts) {
    ports.push(...def.dynamicPorts(node.data))
  }
  return ports
}

/** Find a specific port definition */
export function findPort(graph: NodeGraph, ref: PortRef, registry: NodeRegistry): PortDef | undefined {
  return getNodePorts(graph, ref.node, registry).find(p => p.id === ref.port)
}

/** Validate a connection before creating it */
export function validateConnection(
  graph: NodeGraph,
  from: PortRef,
  to: PortRef,
  registry: NodeRegistry,
): ConnectionValidationResult {
  // 1. Can't connect to self
  if (from.node === to.node) {
    return { valid: false, message: 'Cannot connect node to itself' }
  }

  const fromPort = findPort(graph, from, registry)
  const toPort = findPort(graph, to, registry)

  if (!fromPort || !toPort) {
    return { valid: false, message: 'Port not found' }
  }

  // 2. Direction: from must be out, to must be in
  if (fromPort.direction !== 'out') {
    return { valid: false, message: 'Source must be an output port' }
  }
  if (toPort.direction !== 'in') {
    return { valid: false, message: 'Target must be an input port' }
  }

  // 3. Type compatibility: 'any' or undefined matches everything, same types match
  if (fromPort.type && toPort.type && fromPort.type !== 'any' && toPort.type !== 'any') {
    if (fromPort.type !== toPort.type) {
      // Warning, not error — LLM-first approach
      return { valid: true, message: `Type mismatch: ${fromPort.type} → ${toPort.type}` }
    }
  }

  return { valid: true }
}
