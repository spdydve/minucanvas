/* @vitest-environment jsdom */

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasStyleToolbar } from './CanvasStyleToolbar'
import type { CanvasEdgeArrowMode, JsonCanvasDocument } from './types'

const MODES: Array<{
  label: string
  mode: CanvasEdgeArrowMode
  fromEnd: 'none' | 'arrow'
  toEnd: 'none' | 'arrow'
}> = [
  { label: 'No arrows', mode: 'none', fromEnd: 'none', toEnd: 'none' },
  { label: 'Arrow at end', mode: 'end', fromEnd: 'none', toEnd: 'arrow' },
  { label: 'Arrow at start', mode: 'start', fromEnd: 'arrow', toEnd: 'none' },
  { label: 'Arrows at both ends', mode: 'both', fromEnd: 'arrow', toEnd: 'arrow' },
]

describe('CanvasStyleToolbar connector arrows', () => {
  it.each(MODES)('applies $mode to every selected edge', ({ label, fromEnd, toEnd }) => {
    const value: JsonCanvasDocument = {
      nodes: [],
      edges: [
        { id: 'edge-1', fromNode: 'a', toNode: 'b' },
        { id: 'edge-2', fromNode: 'b', toNode: 'c', fromEnd: 'arrow', toEnd: 'none' },
        { id: 'edge-3', fromNode: 'c', toNode: 'd' },
      ],
    }
    const onChange = vi.fn()
    const view = render(
      <CanvasStyleToolbar
        value={value}
        selection={{ nodeIds: [], edgeIds: ['edge-1', 'edge-2'] }}
        onChange={onChange}
      />,
    )

    fireEvent.click(view.getByTitle('Line'))
    fireEvent.click(view.getByRole('button', { name: label }))

    const [next, context] = onChange.mock.calls[0]!
    expect(next.edges.slice(0, 2)).toEqual([
      expect.objectContaining({ fromEnd, toEnd }),
      expect.objectContaining({ fromEnd, toEnd }),
    ])
    expect(next.edges[2]).toBe(value.edges[2])
    expect(context).toEqual({ reason: 'update-edge' })
  })
})
