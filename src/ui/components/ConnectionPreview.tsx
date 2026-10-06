import type { Position } from '../../core/types'

export interface ConnectionPreviewProps {
  from: Position
  to: Position
}

export function ConnectionPreview({ from, to }: ConnectionPreviewProps) {
  const dx = Math.abs(to.x - from.x)
  const cp = Math.max(dx * 0.5, 50)
  const path = `M ${from.x} ${from.y} C ${from.x + cp} ${from.y}, ${to.x - cp} ${to.y}, ${to.x} ${to.y}`

  return (
    <path d={path} className="nn-connection-preview" />
  )
}
