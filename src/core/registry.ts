import type { NodeDef, GraphNode, Position } from './types'
import { generateId } from './id'

export class NodeRegistry {
  private defs = new Map<string, NodeDef>()

  /** Register a node prototype */
  register(def: NodeDef): void {
    this.defs.set(def.type, def)
  }

  /** Get prototype by type */
  get(type: string): NodeDef | undefined {
    return this.defs.get(type)
  }

  /** All registered prototypes */
  getAll(): NodeDef[] {
    return Array.from(this.defs.values())
  }

  /** Prototypes by category */
  getByCategory(category: string): NodeDef[] {
    return this.getAll().filter(d => d.category === category)
  }

  /** All categories */
  getCategories(): string[] {
    const cats = new Set<string>()
    for (const def of this.defs.values()) {
      if (def.category) cats.add(def.category)
    }
    return Array.from(cats)
  }

  /** Create a new node instance with default data */
  createNode(type: string, position: Position): GraphNode {
    const def = this.defs.get(type)
    if (!def) throw new Error(`Unknown node type: ${type}`)

    return {
      id: generateId(),
      type,
      position,
      data: def.defaultData ? { ...def.defaultData } : {},
    }
  }
}
