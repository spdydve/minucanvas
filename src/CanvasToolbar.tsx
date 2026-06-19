import type { CanvasTool } from './types'

export interface CanvasToolbarProps {
  tool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  className?: string
  orientation?: 'vertical' | 'horizontal'
  tools?: CanvasTool[]
}

const DEFAULT_TOOLS: CanvasTool[] = ['select', 'hand', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'text', 'pill']

const SHORTCUTS: Record<CanvasTool, string> = {
  select: 'V',
  hand: 'H',
  arrow: 'A',
  line: 'L',
  text: 'T',
  rectangle: 'R',
  diamond: 'D',
  ellipse: 'O',
  pill: 'P',
}

const LABELS: Record<CanvasTool, string> = {
  select: 'Select',
  hand: 'Hand',
  arrow: 'Arrow',
  line: 'Line',
  text: 'Text',
  rectangle: 'Rectangle',
  diamond: 'Diamond',
  ellipse: 'Ellipse',
  pill: 'Pill',
}

function ToolIcon({ tool }: { tool: CanvasTool }) {
  if (tool === 'select') {
    return <path d="M8 4l8 14 2-6 6-2L8 4z" />
  }
  if (tool === 'hand') {
    return <path d="M8 13v-2a1.5 1.5 0 013 0V7a1.5 1.5 0 013 0v3-5a1.5 1.5 0 013 0v5-3a1.5 1.5 0 013 0v8c0 4-2.5 6-6.5 6H14c-2.3 0-4-1-5.2-2.8L6 14.5A1.6 1.6 0 018 13z" />
  }
  if (tool === 'rectangle') {
    return <rect x="7" y="8" width="14" height="12" rx="1.5" />
  }
  if (tool === 'diamond') {
    return <path d="M14 5l9 9-9 9-9-9 9-9z" />
  }
  if (tool === 'ellipse') {
    return <ellipse cx="14" cy="14" rx="8" ry="7" />
  }
  if (tool === 'arrow') {
    return <path d="M7 21L21 7m0 0h-8m8 0v8" />
  }
  if (tool === 'line') {
    return <path d="M7 21L21 7" />
  }
  if (tool === 'text') {
    return <path d="M6 8V5h16v3M14 5v18M10 23h8" />
  }
  return <path d="M8 14a6 6 0 016-6h0a6 6 0 016 6h0a6 6 0 01-6 6h0a6 6 0 01-6-6z" />
}

export function CanvasToolbar({ tool, onToolChange, className, orientation = 'vertical', tools = DEFAULT_TOOLS }: CanvasToolbarProps) {
  return (
    <div className={`minucanvas-toolbar minucanvas-toolbar--${orientation}${className ? ` ${className}` : ''}`} role="toolbar" aria-label="Canvas tools">
      {tools.map((item) => (
        <button
          key={item}
          type="button"
          className={`minucanvas-toolbar__button${tool === item ? ' minucanvas-toolbar__button--active' : ''}`}
          aria-label={`${LABELS[item]} (${SHORTCUTS[item]})`}
          title={`${LABELS[item]} (${SHORTCUTS[item]})`}
          onClick={() => onToolChange(item)}
        >
          <svg className="minucanvas-toolbar__icon" viewBox="0 0 28 28" aria-hidden="true">
            <ToolIcon tool={item} />
          </svg>
          <span className="minucanvas-toolbar__shortcut">{SHORTCUTS[item]}</span>
        </button>
      ))}
    </div>
  )
}
