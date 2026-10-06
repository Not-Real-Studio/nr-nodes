import React, { useCallback } from 'react'
import type { PortDef } from '../../core/types'

export interface PortViewProps {
  port: PortDef
  nodeId: string
  onDragStart?: (nodeId: string, portId: string, direction: 'in' | 'out') => void
  onDragEnd?: (nodeId: string, portId: string) => void
  connected?: boolean
}

export function PortView({ port, nodeId, onDragStart, connected }: PortViewProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onDragStart?.(nodeId, port.id, port.direction)
  }, [nodeId, port.id, port.direction, onDragStart])

  // No mouseUp handler here — Canvas window handler does findNearestPort on mouseUp

  return (
    <div className={`nn-port nn-port-${port.direction}`}>
      <div
        className={`nn-port-circle ${connected ? 'nn-port-connected' : ''}`}
        data-node-id={nodeId}
        data-port-id={port.id}
        data-direction={port.direction}
        onMouseDown={handleMouseDown}
      />
      <span className="nn-port-label">{port.name}</span>
    </div>
  )
}
