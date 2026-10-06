import type { NodeGraph, GraphNode, Position } from './types.js'

export interface LayoutOptions {
  /** Layer axis: 'LR' — layers go left to right, 'TB' — top to bottom. Default 'LR'. */
  direction?: 'LR' | 'TB'
  /** Node size. Default 220×120. */
  nodeSize?: (node: GraphNode) => { w: number; h: number }
  /** Gap between layers. Default 80. */
  gapX?: number
  /** Gap between nodes inside a layer. Default 40. */
  gapY?: number
}

export const DEFAULT_NODE_SIZE = { w: 220, h: 120 }

/**
 * Layered auto-layout (pure, deterministic, never throws).
 *
 * 1. Layers — longest path from sources. Edges closing a cycle (back edges of a DFS
 *    in `graph.nodes` order) are ignored; isolated nodes land in layer 0.
 * 2. Order inside a layer — barycenter of neighbours, one pass down (predecessors)
 *    and one pass up (successors); ties keep `graph.nodes` order.
 * 3. Members of one group in one layer stay adjacent: sort key is the group's index
 *    in `graph.groups` (ungrouped nodes after all groups), then barycenter.
 * 4. Coordinates start at {0, 0}; each layer is offset by the widest node of the
 *    previous one + gapX, nodes inside a layer step by their height + gapY.
 *    'TB' swaps the axes.
 */
export function layoutLayered(graph: NodeGraph, opts: LayoutOptions = {}): Record<string, Position> {
  const direction = opts.direction ?? 'LR'
  const gapX = opts.gapX ?? 80
  const gapY = opts.gapY ?? 40
  const sizeOf = (node: GraphNode) => {
    let size = DEFAULT_NODE_SIZE
    if (opts.nodeSize) {
      try { size = opts.nodeSize(node) ?? DEFAULT_NODE_SIZE } catch { size = DEFAULT_NODE_SIZE }
    }
    const w = Number.isFinite(size.w) ? size.w : DEFAULT_NODE_SIZE.w
    const h = Number.isFinite(size.h) ? size.h : DEFAULT_NODE_SIZE.h
    return { w, h }
  }

  const nodes = graph.nodes
  const index = new Map<string, number>()
  nodes.forEach((n, i) => { if (!index.has(n.id)) index.set(n.id, i) })
  const count = nodes.length

  // --- adjacency (by node index), unknown endpoints and self-loops dropped ---
  const out: number[][] = Array.from({ length: count }, () => [])
  for (const c of graph.connections) {
    const a = index.get(c.from.node)
    const b = index.get(c.to.node)
    if (a === undefined || b === undefined || a === b) continue
    out[a].push(b)
  }

  // --- 1. drop cycle-closing edges: iterative DFS in graph.nodes order ---
  const state = new Uint8Array(count) // 0 new, 1 on stack, 2 done
  const dag: number[][] = Array.from({ length: count }, () => [])
  for (let root = 0; root < count; root++) {
    if (state[root]) continue
    const stack: Array<[number, number]> = [[root, 0]]
    state[root] = 1
    while (stack.length) {
      const top = stack[stack.length - 1]
      const [v, i] = top
      if (i < out[v].length) {
        top[1]++
        const w = out[v][i]
        if (state[w] === 1) continue // back edge — closes a cycle
        dag[v].push(w)
        if (state[w] === 0) { state[w] = 1; stack.push([w, 0]) }
      } else {
        state[v] = 2
        stack.pop()
      }
    }
  }

  const preds: number[][] = Array.from({ length: count }, () => [])
  for (let v = 0; v < count; v++) for (const w of dag[v]) preds[w].push(v)

  // --- longest path layering via Kahn (ties by original order) ---
  const layerOf = new Array<number>(count).fill(0)
  const indeg = preds.map(p => p.length)
  const queue: number[] = []
  for (let v = 0; v < count; v++) if (indeg[v] === 0) queue.push(v)
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q]
    for (const w of dag[v]) {
      if (layerOf[v] + 1 > layerOf[w]) layerOf[w] = layerOf[v] + 1
      if (--indeg[w] === 0) queue.push(w)
    }
  }

  const layerCount = count ? Math.max(...layerOf) + 1 : 0
  const layers: number[][] = Array.from({ length: layerCount }, () => [])
  for (let v = 0; v < count; v++) layers[layerOf[v]].push(v)

  // --- group keys ---
  const groupKey = new Array<number>(count).fill(graph.groups?.length ?? 0)
  graph.groups?.forEach((g, gi) => {
    for (const id of g.nodes) {
      const v = index.get(id)
      if (v !== undefined && groupKey[v] === (graph.groups?.length ?? 0)) groupKey[v] = gi
    }
  })

  // --- 2–3. ordering ---
  const pos = new Array<number>(count).fill(0)
  const sortLayer = (layer: number[], bary: (v: number) => number) => {
    const key = new Map<number, number>()
    for (const v of layer) key.set(v, bary(v))
    layer.sort((a, b) =>
      groupKey[a] - groupKey[b] ||
      key.get(a)! - key.get(b)! ||
      a - b,
    )
    layer.forEach((v, i) => { pos[v] = i })
  }
  const succs = dag
  const barycenter = (neigh: number[][]) => (v: number) => {
    const ns = neigh[v]
    if (!ns.length) return pos[v]
    let sum = 0
    for (const n of ns) sum += pos[n]
    return sum / ns.length
  }

  for (const layer of layers) sortLayer(layer, v => v) // initial: original order, grouped
  for (let l = 1; l < layerCount; l++) sortLayer(layers[l], barycenter(preds))
  for (let l = layerCount - 2; l >= 0; l--) sortLayer(layers[l], barycenter(succs))

  // --- 4. coordinates ---
  const result: Record<string, Position> = {}
  const sizes = nodes.map(sizeOf)
  let layerOffset = 0
  for (const layer of layers) {
    let along = 0
    let thickness = 0
    for (const v of layer) {
      const { w, h } = sizes[v]
      const across = direction === 'LR' ? w : h
      const step = direction === 'LR' ? h : w
      result[nodes[v].id] = direction === 'LR'
        ? { x: layerOffset, y: along }
        : { x: along, y: layerOffset }
      along += step + gapY
      if (across > thickness) thickness = across
    }
    layerOffset += thickness + gapX
  }
  return result
}

/** Apply positions (e.g. from `layoutLayered`) to the graph. Nodes without a position keep theirs. */
export function applyLayout(graph: NodeGraph, positions: Record<string, Position>): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n => {
      const p = positions[n.id]
      return p ? { ...n, position: { x: p.x, y: p.y } } : n
    }),
  }
}
