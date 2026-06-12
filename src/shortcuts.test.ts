import { describe, expect, it } from 'vitest'
import { defaultCanvasShortcuts, toolFromKey } from './shortcuts'

describe('canvas shortcuts', () => {
  it('maps mnemonic tool shortcuts', () => {
    expect(toolFromKey('v')).toBe('select')
    expect(toolFromKey('h')).toBe('hand')
    expect(toolFromKey('a')).toBe('arrow')
    expect(toolFromKey('l')).toBe('line')
    expect(toolFromKey('t')).toBe('text')
    expect(toolFromKey('r')).toBe('rectangle')
    expect(toolFromKey('d')).toBe('diamond')
    expect(toolFromKey('o')).toBe('ellipse')
    expect(toolFromKey('p')).toBe('pill')
  })

  it('maps Excalidraw-style number aliases without conflicts', () => {
    expect(toolFromKey('1')).toBe('select')
    expect(toolFromKey('2')).toBe('rectangle')
    expect(toolFromKey('3')).toBe('diamond')
    expect(toolFromKey('4')).toBe('ellipse')
    expect(toolFromKey('5')).toBe('arrow')
    expect(toolFromKey('6')).toBe('text')
    expect(toolFromKey('7')).toBe('line')
    expect(toolFromKey('8')).toBe('pill')
  })

  it('does not advertise removed connector tool', () => {
    expect(defaultCanvasShortcuts.some((shortcut) => String(shortcut.tool) === 'connector')).toBe(false)
  })
})
