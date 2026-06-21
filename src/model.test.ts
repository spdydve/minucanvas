import { describe, expect, it } from 'vitest'
import { createCanvasEdge, createCanvasNode, deleteSelection, duplicateSelection, shapeForTool, snapPoint } from './model'
import type { JsonCanvasDocument } from './types'

describe('canvas model helpers', () => {
  it('creates JSON Canvas compatible nodes and edges', () => {
    const start = createCanvasNode({ id: 'start', x: 0, y: 0, text: 'Start' })
    const end = createCanvasNode({ id: 'end', x: 240, y: 0, text: 'End', shape: 'diamond' })
    const edge = createCanvasEdge('start', 'end', { id: 'edge-1' })

    expect(start.type).toBe('text')
    expect(end.shape).toBe('diamond')
    expect(edge.toEnd).toBe('arrow')
  })

  it('deletes selected nodes and attached edges', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a' }), createCanvasNode({ id: 'b' })],
      edges: [createCanvasEdge('a', 'b', { id: 'ab' })],
    }

    expect(deleteSelection(document, { nodeIds: ['a'], edgeIds: [] })).toEqual({
      nodes: [document.nodes[1]],
      edges: [],
    })
  })

  it('duplicates selected subgraphs', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a' }), createCanvasNode({ id: 'b' })],
      edges: [createCanvasEdge('a', 'b', { id: 'ab' })],
    }

    const duplicated = duplicateSelection(document, { nodeIds: ['a', 'b'], edgeIds: [] })

    expect(duplicated.document.nodes).toHaveLength(4)
    expect(duplicated.document.edges).toHaveLength(2)
    expect(duplicated.selection.nodeIds).toHaveLength(2)
    expect(duplicated.selection.edgeIds).toHaveLength(1)
  })

  it('creates default diamonds at a 3:2 grid-friendly ratio', () => {
    const node = createCanvasNode({ type: 'text', shape: 'diamond' })
    expect(node.width).toBe(240)
    expect(node.height).toBe(160)
  })

  it('creates default ellipses as true circles', () => {
    const node = createCanvasNode({ type: 'text', shape: 'ellipse' })
    expect(node.width).toBe(160)
    expect(node.height).toBe(160)
  })

  it('maps tool keys to matching base flowchart shapes', () => {
    expect(shapeForTool('rectangle')).toBe('rectangle')
    expect(shapeForTool('diamond')).toBe('diamond')
    expect(shapeForTool('ellipse')).toBe('ellipse')
  })

  it('snaps points to the configured grid', () => {
    expect(snapPoint({ x: 23, y: 38 }, 20)).toEqual({ x: 20, y: 40 })
  })
})
