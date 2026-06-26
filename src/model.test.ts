import { describe, expect, it } from 'vitest'
import { createCanvasEdge, createCanvasNode, deleteSelection, duplicateSelection, frameSelection, shapeForTool, snapPoint } from './model'
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

  it('creates frame groups around selected nodes', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a', x: 0, y: 0 }), createCanvasNode({ id: 'b', x: 260, y: 0 })],
      edges: [],
    }

    const result = frameSelection(document, { nodeIds: ['a', 'b'], edgeIds: [] })

    expect(result.group).toMatchObject({ type: 'group', frame: true, label: 'Frame' })
    expect(result.document.nodes.find((node) => node.id === 'a')?.groupId).toBe(result.group?.id)
    expect(result.document.nodes.find((node) => node.id === 'b')?.groupId).toBe(result.group?.id)
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

  it('creates free-standing and hybrid line edges with points', () => {
    const edge = createCanvasEdge('', '', {
      id: 'free-arrow',
      fromPoint: { x: 10, y: 20 },
      toPoint: { x: 110, y: 80 },
      toEnd: 'arrow',
      style: { routing: 'straight' },
    })

    expect(edge.fromPoint).toEqual({ x: 10, y: 20 })
    expect(edge.toPoint).toEqual({ x: 110, y: 80 })
    expect(edge.toEnd).toBe('arrow')

    const hybrid = createCanvasEdge('node-a', '', {
      id: 'hybrid-line',
      toPoint: { x: 220, y: 40 },
      toEnd: 'none',
    })
    expect(hybrid.fromNode).toBe('node-a')
    expect(hybrid.toNode).toBe('')
    expect(hybrid.toPoint).toEqual({ x: 220, y: 40 })
  })

  it('creates default flow nodes with a compact height', () => {
    const node = createCanvasNode({ type: 'text', shape: 'rounded-rectangle' })
    expect(node.width).toBe(220)
    expect(node.height).toBe(88)
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
