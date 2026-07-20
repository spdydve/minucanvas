/* @vitest-environment jsdom */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MinuCanvas } from './MinuCanvas'
import { createCanvasNode } from './model'
import type { CanvasSelection, JsonCanvasDocument } from './types'

function renderCanvasHarness(initialDocument: JsonCanvasDocument, initialSelection: CanvasSelection) {
  let latestDocument = initialDocument
  let latestSelection = initialSelection

  function Harness() {
    const [document, setDocument] = useState(initialDocument)
    const [selection, setSelection] = useState(initialSelection)
    return (
      <MinuCanvas
        value={document}
        onChange={(next) => {
          latestDocument = next
          setDocument(next)
        }}
        selectedNodeIds={selection.nodeIds}
        selectedEdgeIds={selection.edgeIds}
        onSelectionChange={(next) => {
          latestSelection = next
          setSelection(next)
        }}
      />
    )
  }

  const view = render(<Harness />)
  return {
    ...view,
    get latestDocument() { return latestDocument },
    get latestSelection() { return latestSelection },
  }
}

describe('MinuCanvas linked nodes', () => {
  it('opens a selected node URL with Cmd/Ctrl+Enter', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'docs', text: 'Docs', url: 'https://docs.example.com', x: 0, y: 0 })],
      edges: [],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['docs'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'Enter', metaKey: true })

    expect(open).toHaveBeenCalledWith('https://docs.example.com', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('renders URL badges and host node adornments', () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'docs', text: 'Docs', url: 'https://docs.example.com', x: 0, y: 0 })],
      edges: [],
    }

    const view = render(
      <MinuCanvas
        value={initialDocument}
        onChange={() => {}}
        renderNodeAdornment={({ node }) => node.id === 'docs' ? <span data-testid="note-adornment">note</span> : null}
      />,
    )

    expect(view.getByLabelText('Open linked URL')).toBeTruthy()
    expect(view.getByTestId('note-adornment')).toBeTruthy()
  })
})

describe('MinuCanvas connector routing', () => {
  it('preserves a manually positioned endpoint when a connected node moves', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          fromSide: 'top',
          toSide: 'left',
          fromAnchor: { side: 'top', position: 0.25 },
          toAnchor: { side: 'left', position: 0.75 },
          toEnd: 'arrow',
          style: { routing: 'elbow' },
          routingMode: 'manual',
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'A')?.x).toBe(20))
    expect(view.latestDocument.edges[0]).toMatchObject({
      fromSide: 'top',
      toSide: 'left',
      fromAnchor: { side: 'top', position: 0.25 },
      toAnchor: { side: 'left', position: 0.75 },
      routingMode: 'manual',
    })
  })

  it('preserves manually routed connector waypoints when a connected node moves', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          fromSide: 'bottom',
          toSide: 'left',
          fromAnchor: { side: 'bottom', position: 0.25 },
          toAnchor: { side: 'left', position: 0.75 },
          toEnd: 'arrow',
          style: { routing: 'elbow' },
          waypoints: [{ x: 120, y: 180 }, { x: 220, y: 180 }],
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'A')?.x).toBe(20))
    expect(view.latestDocument.edges[0]).toMatchObject({
      fromSide: 'bottom',
      toSide: 'left',
      fromAnchor: { side: 'bottom', position: 0.25 },
      toAnchor: { side: 'left', position: 0.75 },
      waypoints: [{ x: 120, y: 180 }, { x: 220, y: 180 }],
    })
  })
})

describe('MinuCanvas keyboard creation', () => {
  it('allows Cmd/Ctrl+Arrow to create from a node that is already being edited after keyboard creation', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'rounded-rectangle', x: 0, y: 0, width: 160, height: 80 })],
      edges: [],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight', metaKey: true })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(2))
    const firstNew = view.latestDocument.nodes.find((node) => node.id !== 'Root')!
    expect(view.latestSelection).toEqual({ nodeIds: [firstNew.id], edgeIds: [] })
    const editable = await waitFor(() => {
      const element = view.container.querySelector<HTMLElement>(`[data-minucanvas-node-id="${firstNew.id}"] [contenteditable="true"]`)
      expect(element).toBeTruthy()
      return element!
    })

    fireEvent.keyDown(editable, { key: 'ArrowDown', metaKey: true })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(3))
    const secondNew = view.latestDocument.nodes.find((node) => node.id !== 'Root' && node.id !== firstNew.id)!
    expect(view.latestDocument.edges).toContainEqual(expect.objectContaining({ fromNode: firstNew.id, toNode: secondNew.id }))
    expect(view.latestSelection).toEqual({ nodeIds: [secondNew.id], edgeIds: [] })
  })
})
