import type { Position } from '../../core/types.js'

export interface ConnectionViewProps {
  from: Position
  to: Position
  selected?: boolean
  warning?: boolean
  onClick?: () => void
}

function bezierPath(from: Position, to: Position): string {
  const dx = Math.abs(to.x - from.x)
  const cp = Math.max(dx * 0.5, 50)
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y}, ${to.x - cp} ${to.y}, ${to.x} ${to.y}`
}

export function ConnectionView({ from, to, selected, warning, onClick }: ConnectionViewProps) {
  const path = bezierPath(from, to)
  let className = 'nn-connection'
  if (selected) className += ' nn-connection-selected'
  if (warning) className += ' nn-connection-warning'

  return (
    <g className={className} onClick={onClick}>
      {/* Hit area (wider, invisible) */}
      <path d={path} className="nn-connection-hit" />
      {/* Visible line */}
      <path d={path} className="nn-connection-line" />
    </g>
  )
}
