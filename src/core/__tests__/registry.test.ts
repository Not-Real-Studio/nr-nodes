import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry.js'
import type { NodeDef } from '../types.js'

function makeDef(type: string, category?: string): NodeDef {
  return {
    type,
    displayName: type,
    category,
    ports: [
      { id: 'output', name: 'output', direction: 'out', type: 'any' },
    ],
    defaultData: { value: 1 },
  }
}

describe('NodeRegistry', () => {
  it('register and get', () => {
    const reg = new NodeRegistry()
    const def = makeDef('test')
    reg.register(def)
    expect(reg.get('test')).toBe(def)
    expect(reg.get('unknown')).toBeUndefined()
  })

  it('getAll returns all registered', () => {
    const reg = new NodeRegistry()
    reg.register(makeDef('a'))
    reg.register(makeDef('b'))
    expect(reg.getAll()).toHaveLength(2)
  })

  it('getByCategory filters correctly', () => {
    const reg = new NodeRegistry()
    reg.register(makeDef('a', 'Sources'))
    reg.register(makeDef('b', 'Combinators'))
    reg.register(makeDef('c', 'Sources'))
    expect(reg.getByCategory('Sources')).toHaveLength(2)
    expect(reg.getByCategory('Combinators')).toHaveLength(1)
    expect(reg.getByCategory('Other')).toHaveLength(0)
  })

  it('getCategories returns unique categories', () => {
    const reg = new NodeRegistry()
    reg.register(makeDef('a', 'Sources'))
    reg.register(makeDef('b', 'Combinators'))
    reg.register(makeDef('c', 'Sources'))
    const cats = reg.getCategories()
    expect(cats).toContain('Sources')
    expect(cats).toContain('Combinators')
    expect(cats).toHaveLength(2)
  })

  it('createNode creates instance with defaults', () => {
    const reg = new NodeRegistry()
    reg.register(makeDef('test'))
    const node = reg.createNode('test', { x: 10, y: 20 })
    expect(node.type).toBe('test')
    expect(node.position).toEqual({ x: 10, y: 20 })
    expect(node.data).toEqual({ value: 1 })
    expect(node.id).toHaveLength(6)
  })

  it('createNode throws for unknown type', () => {
    const reg = new NodeRegistry()
    expect(() => reg.createNode('unknown', { x: 0, y: 0 })).toThrow('Unknown node type')
  })

  it('createNode generates unique ids', () => {
    const reg = new NodeRegistry()
    reg.register(makeDef('test'))
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(reg.createNode('test', { x: 0, y: 0 }).id)
    }
    expect(ids.size).toBe(100)
  })
})
