import { describe, it, expect } from 'vitest'
import {
  createEmptyGraph, addNode, removeNode,
  addGroup, removeGroup, updateGroup, setNodeGroup, getNodeGroup, moveNodes,
} from '../graph-ops.js'
import { serializeGraph, deserializeGraph } from '../serialization.js'
import type { NodeGraph } from '../types.js'

function graphOf(...ids: string[]): NodeGraph {
  let g = createEmptyGraph('G')
  ids.forEach((id, i) => {
    g = addNode(g, { id, type: 't', position: { x: i * 10, y: 0 }, data: {} })[0]
  })
  return g
}

/** Every node is in at most one group. */
function membershipUnique(g: NodeGraph): boolean {
  const seen = new Set<string>()
  for (const grp of g.groups ?? []) for (const id of grp.nodes) {
    if (seen.has(id)) return false
    seen.add(id)
  }
  return true
}

describe('groups', () => {
  it('addGroup creates a group and returns its id', () => {
    const g0 = graphOf('a', 'b', 'c')
    const [g, id] = addGroup(g0, { name: 'Alice', nodes: ['a', 'b'], color: '#f00' })
    expect(g.groups).toEqual([{ id, name: 'Alice', nodes: ['a', 'b'], color: '#f00' }])
    expect(g0.groups).toBeUndefined() // immutable
  })

  it('addGroup without nodes creates an empty group; drops unknown and duplicate ids', () => {
    const [g1] = addGroup(graphOf('a'), { name: 'Empty' })
    expect(g1.groups![0].nodes).toEqual([])
    expect(g1.groups![0]).not.toHaveProperty('color')
    const [g2] = addGroup(graphOf('a'), { name: 'X', nodes: ['a', 'a', 'ghost'] })
    expect(g2.groups![0].nodes).toEqual(['a'])
  })

  it('a node belongs to at most one group: addGroup moves it', () => {
    const [g1, first] = addGroup(graphOf('a', 'b'), { name: 'one', nodes: ['a', 'b'] })
    const [g2, second] = addGroup(g1, { name: 'two', nodes: ['b'] })
    expect(g2.groups!.find(x => x.id === first)!.nodes).toEqual(['a'])
    expect(g2.groups!.find(x => x.id === second)!.nodes).toEqual(['b'])
    expect(membershipUnique(g2)).toBe(true)
  })

  it('removeGroup keeps the nodes', () => {
    const [g1, id] = addGroup(graphOf('a', 'b'), { name: 'one', nodes: ['a'] })
    const g2 = removeGroup(g1, id)
    expect(g2.groups).toEqual([])
    expect(g2.nodes.map(n => n.id)).toEqual(['a', 'b'])
  })

  it('updateGroup patches fields and keeps membership unique', () => {
    const [g1, one] = addGroup(graphOf('a', 'b', 'c'), { name: 'one', nodes: ['a', 'b'] })
    const [g2, two] = addGroup(g1, { name: 'two', nodes: ['c'] })
    const g3 = updateGroup(g2, two, { name: 'renamed', color: 'red', nodes: ['c', 'a'] })
    const t = g3.groups!.find(x => x.id === two)!
    expect(t).toEqual({ id: two, name: 'renamed', color: 'red', nodes: ['c', 'a'] })
    expect(g3.groups!.find(x => x.id === one)!.nodes).toEqual(['b'])
    expect(membershipUnique(g3)).toBe(true)
    expect(updateGroup(g3, 'ghost', { name: 'x' })).toBe(g3)
  })

  it('setNodeGroup moves a node between groups and out of any group', () => {
    const [g1, one] = addGroup(graphOf('a', 'b'), { name: 'one', nodes: ['a'] })
    const [g2, two] = addGroup(g1, { name: 'two' })
    const g3 = setNodeGroup(g2, 'a', two)
    expect(getNodeGroup(g3, 'a')!.id).toBe(two)
    expect(g3.groups!.find(x => x.id === one)!.nodes).toEqual([])
    const g4 = setNodeGroup(g3, 'a', null)
    expect(getNodeGroup(g4, 'a')).toBeUndefined()
    expect(membershipUnique(g4)).toBe(true)
    expect(setNodeGroup(g4, 'a', 'ghost')).toBe(g4)
    expect(setNodeGroup(g4, 'ghost', two)).toBe(g4)
  })

  it('removeNode removes the node from its group', () => {
    const [g1, id] = addGroup(graphOf('a', 'b'), { name: 'one', nodes: ['a', 'b'] })
    const g2 = removeNode(g1, 'a')
    expect(g2.groups!.find(x => x.id === id)!.nodes).toEqual(['b'])
  })

  it('graph without groups stays valid', () => {
    const g = graphOf('a', 'b')
    const g2 = removeNode(g, 'a')
    expect(g2).not.toHaveProperty('groups')
    expect(getNodeGroup(g, 'a')).toBeUndefined()
    expect(removeGroup(g, 'x')).toBe(g)
    const restored = deserializeGraph(serializeGraph(g))
    expect(restored.groups).toBeUndefined()
    expect(restored.nodes).toHaveLength(2)
  })

  it('serialization passes groups through as is', () => {
    const [g] = addGroup(graphOf('a', 'b'), { name: 'one', nodes: ['b'], color: '#0f0' })
    expect(deserializeGraph(serializeGraph(g)).groups).toEqual(g.groups)
  })

  it('moveNodes shifts only listed nodes', () => {
    const g = moveNodes(graphOf('a', 'b', 'c'), ['a', 'c'], { x: 5, y: 7 })
    expect(g.nodes.map(n => n.position)).toEqual([
      { x: 5, y: 7 }, { x: 10, y: 0 }, { x: 25, y: 7 },
    ])
  })
})
