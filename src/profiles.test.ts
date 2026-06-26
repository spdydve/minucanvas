import { describe, expect, it } from 'vitest'
import { anchorForEdgeAnchor } from './geometry'
import { createCanvasEdge, createCanvasNode } from './model'
import {
  applyCanvasDocumentProfileLayout,
  getCanvasDocumentProfile,
  MIND_MAP_TOOLS,
  mindMapCanvasProfile,
  resolveCanvasInteractionMode,
  standardCanvasProfile,
  toolsForCanvasProfile,
} from './profiles'
import type { JsonCanvasDocument } from './types'

describe('canvas document profiles', () => {
  it('exposes canvas and mind map built-in profiles', () => {
    expect(standardCanvasProfile).toMatchObject({ kind: 'canvas', label: 'Canvas', interactionMode: 'canvas' })
    expect(mindMapCanvasProfile).toMatchObject({ kind: 'mindmap', label: 'Mind map', interactionMode: 'mindmap' })
    expect(getCanvasDocumentProfile('canvas')).toBe(standardCanvasProfile)
    expect(getCanvasDocumentProfile('mindmap')).toBe(mindMapCanvasProfile)
    expect(getCanvasDocumentProfile('custom')).toBeUndefined()
  })

  it('resolves interaction mode and toolbar tools from a profile with canvas fallbacks', () => {
    expect(resolveCanvasInteractionMode(mindMapCanvasProfile)).toBe('mindmap')
    expect(resolveCanvasInteractionMode(undefined)).toBe('canvas')
    expect(toolsForCanvasProfile(mindMapCanvasProfile)).toBe(MIND_MAP_TOOLS)
    expect(toolsForCanvasProfile(undefined)).toBe(standardCanvasProfile.toolbarTools)
  })

  it('creates a default mind map document with a compact text root', () => {
    const document = mindMapCanvasProfile.createDefaultDocument?.()

    expect(document?.nodes).toHaveLength(1)
    expect(document?.edges).toHaveLength(0)
    expect(document?.nodes[0]).toMatchObject({
      id: 'root',
      type: 'text',
      text: 'Central topic',
      shape: 'text',
      x: 14,
      y: 62,
      width: 132,
      height: 36,
    })
  })

  it('uses the mind map profile as the first profile-backed layout implementation', () => {
    const document: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'Root', text: 'Root', shape: 'text' }),
        createCanvasNode({ id: 'Research', text: 'Research', shape: 'text' }),
        createCanvasNode({ id: 'Build', text: 'Build', shape: 'text' }),
      ],
      edges: [
        createCanvasEdge('Root', 'Research', { id: 'root-research' }),
        createCanvasEdge('Root', 'Build', { id: 'root-build' }),
      ],
    }

    const next = applyCanvasDocumentProfileLayout(document, mindMapCanvasProfile, { rootId: 'Root' })
    const root = next.nodes.find((node) => node.id === 'Root')!
    const research = next.nodes.find((node) => node.id === 'Research')!
    const build = next.nodes.find((node) => node.id === 'Build')!

    expect(research.x).toBeGreaterThan(root.x)
    expect(build.x).toBeLessThan(root.x)
    expect(next.edges.every((edge) => edge.toEnd === 'none' && edge.style?.routing === 'curved')).toBe(true)
  })

  it('defaults omitted anchor positions to side midpoint', () => {
    const node = createCanvasNode({ id: 'node', x: 10, y: 20, width: 100, height: 80 })

    expect(anchorForEdgeAnchor(node, { side: 'right' })).toEqual({ x: 110, y: 60 })
  })
})
