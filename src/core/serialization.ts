import type { NodeGraph } from './types.js'

/** Serialize graph to JSON string */
export function serializeGraph(graph: NodeGraph): string {
  return JSON.stringify(graph, null, 2)
}

/** Deserialize graph from JSON string */
export function deserializeGraph(json: string): NodeGraph {
  const graph = JSON.parse(json) as NodeGraph
  if (!graph.version) graph.version = 2
  if (!graph.nodes) graph.nodes = []
  if (!graph.connections) graph.connections = []
  return graph
}
