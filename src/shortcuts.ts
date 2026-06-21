import type { CanvasShortcut, CanvasTool } from './types'

export const defaultCanvasShortcuts: CanvasShortcut[] = [
  { key: 'V', description: 'Select / move', tool: 'select' },
  { key: 'H', description: 'Hand / pan', tool: 'hand' },
  { key: 'Space', description: 'Hold for hand tool' },
  { key: 'A / 5', description: 'Arrow', tool: 'arrow' },
  { key: 'L / 7', description: 'Line', tool: 'line' },
  { key: 'T / 6', description: 'Text card', tool: 'text' },
  { key: 'R / 2', description: 'Rectangle', tool: 'rectangle' },
  { key: 'D / 3', description: 'Diamond', tool: 'diamond' },
  { key: 'O / 4', description: 'Ellipse', tool: 'ellipse' },
  { key: 'P / 8', description: 'Pill', tool: 'pill' },
  { key: 'Delete / Backspace', description: 'Delete selection' },
  { key: 'Cmd/Ctrl + D', description: 'Duplicate selection' },
  { key: 'Cmd/Ctrl + + / -', description: 'Zoom in / out' },
  { key: 'Arrow keys', description: 'Move selected nodes' },
  { key: 'Alt/Option + Arrow', description: 'Navigate shapes/connectors' },
  { key: 'Tab', description: 'Open shape switcher' },
  { key: 'Enter / F2', description: 'Edit selected label' },
  { key: 'Cmd/Ctrl + 0', description: 'Reset view' },
  { key: 'Cmd/Ctrl + Arrow', description: 'Add connected shape' },
]

export function toolFromKey(key: string): CanvasTool | null {
  const normalized = key.toLowerCase()
  if (normalized === 'v' || normalized === '1') return 'select'
  if (normalized === 'h') return 'hand'
  if (normalized === 'r' || normalized === '2') return 'rectangle'
  if (normalized === 'd' || normalized === '3') return 'diamond'
  if (normalized === 'o' || normalized === '4') return 'ellipse'
  if (normalized === 'a' || normalized === '5') return 'arrow'
  if (normalized === 't' || normalized === '6') return 'text'
  if (normalized === 'l' || normalized === '7') return 'line'
  if (normalized === 'p' || normalized === '8') return 'pill'
  return null
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}
