/* @vitest-environment jsdom */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MinuCanvas } from './MinuCanvas'
import { createCanvasNode } from './model'
import { mindMapCanvasProfile } from './profiles'
import type { CanvasSelection, JsonCanvasDocument } from './types'

function renderMindMapHarness(initialDocument: JsonCanvasDocument, initialSelection: CanvasSelection) {
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
        documentProfile={mindMapCanvasProfile}
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

describe('MinuCanvas mind map editing', () => {
  it('shows add handles for selected nodes but hides resize handles in mind map mode', () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'text' })],
      edges: [],
    }
    const view = renderMindMapHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })

    expect(view.container.querySelectorAll('.minucanvas-add-handle')).toHaveLength(2)
    expect(view.container.querySelector('.minucanvas-resize-handle')).toBeNull()
  })

  it('hides add handles while editing a mind map node', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'text' })],
      edges: [],
    }
    const view = renderMindMapHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'Enter' })

    await waitFor(() => expect(view.container.querySelector('[contenteditable="true"]')).toBeTruthy())
    expect(view.container.querySelector('.minucanvas-add-handle')).toBeNull()
  })

  it('keeps Tab inside the canvas and repeatedly creates editable child branches', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'text' })],
      edges: [],
    }
    const view = renderMindMapHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'Tab' })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(2))
    const firstChild = view.latestDocument.nodes.find((node) => node.id !== 'Root')!
    expect(firstChild.text).toBe('')
    expect(view.latestDocument.edges[0]).toMatchObject({ fromNode: 'Root', toNode: firstChild.id, fromEnd: 'none', toEnd: 'none', style: { routing: 'curved' } })

    const editable = await waitFor(() => {
      const element = view.container.querySelector<HTMLElement>('[contenteditable="true"]')
      expect(element).toBeTruthy()
      return element!
    })
    fireEvent.keyDown(editable, { key: 'Tab' })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(3))
    const secondChild = view.latestDocument.nodes.find((node) => node.id !== 'Root' && node.id !== firstChild.id)!
    expect(secondChild.text).toBe('')
    expect(view.latestDocument.edges).toContainEqual(expect.objectContaining({ fromNode: firstChild.id, toNode: secondChild.id }))
    expect(view.container.querySelector('[contenteditable="true"]')).toBeTruthy()
  })

  it('navigates between nodes with arrows and opens the selected node for editing with Enter', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'Root', text: 'Root', shape: 'text', x: 0, y: 0, width: 120, height: 48 }),
        createCanvasNode({ id: 'Child', text: 'Child', shape: 'text', x: 300, y: 0, width: 120, height: 48 }),
      ],
      edges: [{ id: 'root-child', fromNode: 'Root', toNode: 'Child', fromEnd: 'none', toEnd: 'none', style: { routing: 'curved' } }],
    }
    const view = renderMindMapHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestSelection).toEqual({ nodeIds: ['Child'], edgeIds: [] }))
    fireEvent.keyDown(canvas, { key: 'Enter' })

    await waitFor(() => expect(view.container.querySelector('[data-minucanvas-node-id="Child"] [contenteditable="true"]')).toBeTruthy())
    expect(view.latestDocument.nodes).toHaveLength(2)
  })

  it('creates editable siblings on repeated Enter even when the current node is empty', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'text' })],
      edges: [],
    }
    const view = renderMindMapHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'Tab' })
    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(2))
    const firstChild = view.latestDocument.nodes.find((node) => node.id !== 'Root')!

    const editable = await waitFor(() => view.container.querySelector<HTMLElement>('[contenteditable="true"]')!)
    fireEvent.keyDown(editable, { key: 'Enter' })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(3))
    const sibling = view.latestDocument.nodes.find((node) => node.id !== 'Root' && node.id !== firstChild.id)!
    expect(sibling.text).toBe('')
    expect(view.latestDocument.edges).toContainEqual(expect.objectContaining({ fromNode: 'Root', toNode: firstChild.id }))
    expect(view.latestDocument.edges).toContainEqual(expect.objectContaining({ fromNode: 'Root', toNode: sibling.id }))
    expect(view.container.querySelector('[contenteditable="true"]')).toBeTruthy()
  })
})
