import React from 'react'
import type { NodeRegistry } from '../../core/registry'

export interface ToolbarProps {
  registry: NodeRegistry
  onAddNode: (type: string) => void
  onSave?: () => void
  onLoad?: () => void
  onClear?: () => void
  graphName?: string
  onNameChange?: (name: string) => void
  /** Extra buttons from consumer */
  extra?: React.ReactNode
}

export function Toolbar({
  registry, onAddNode, onSave, onLoad, onClear,
  graphName, onNameChange, extra,
}: ToolbarProps) {
  const categories = registry.getCategories()
  const uncategorized = registry.getAll().filter(d => !d.category)

  return (
    <div className="nn-toolbar">
      {/* Graph name */}
      {onNameChange && (
        <input
          className="nn-toolbar-name"
          value={graphName || ''}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Graph name"
        />
      )}

      {/* Node buttons by category */}
      {categories.map(cat => (
        <div key={cat} className="nn-toolbar-group">
          <span className="nn-toolbar-group-label">{cat}</span>
          {registry.getByCategory(cat).map(def => (
            <button
              key={def.type}
              className="nn-toolbar-btn"
              onClick={() => onAddNode(def.type)}
              title={def.description || def.displayName}
            >
              {def.icon && <span>{def.icon}</span>}
              {def.displayName}
            </button>
          ))}
        </div>
      ))}

      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <div className="nn-toolbar-group">
          {uncategorized.map(def => (
            <button
              key={def.type}
              className="nn-toolbar-btn"
              onClick={() => onAddNode(def.type)}
              title={def.description || def.displayName}
            >
              {def.icon && <span>{def.icon}</span>}
              {def.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="nn-toolbar-actions">
        {onSave && <button className="nn-toolbar-btn" onClick={onSave}>Save</button>}
        {onLoad && <button className="nn-toolbar-btn" onClick={onLoad}>Load</button>}
        {onClear && <button className="nn-toolbar-btn nn-toolbar-btn-danger" onClick={onClear}>Clear</button>}
      </div>

      {extra && <div className="nn-toolbar-extra">{extra}</div>}
    </div>
  )
}
