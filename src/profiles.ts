import { createDefaultMindMapDocument, layoutMindMap, type MindMapProfileOptions } from './mindmap'
import { createDefaultCanvasDocument } from './model'
import type { AnyCanvasDocumentProfile, CanvasDocumentKind, CanvasDocumentProfile, CanvasInteractionMode, CanvasTool, MinuCanvasDocument } from './types'

export const STANDARD_CANVAS_TOOLS: CanvasTool[] = ['select', 'hand', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'text', 'pill']
export const MIND_MAP_TOOLS: CanvasTool[] = ['select', 'hand', 'text', 'arrow', 'line']

export const standardCanvasProfile: CanvasDocumentProfile = {
  kind: 'canvas',
  label: 'Canvas',
  interactionMode: 'canvas',
  toolbarTools: STANDARD_CANVAS_TOOLS,
  createDefaultDocument: () => createDefaultCanvasDocument(),
}

export const mindMapCanvasProfile: CanvasDocumentProfile<MindMapProfileOptions> = {
  kind: 'mindmap',
  label: 'Mind map',
  interactionMode: 'mindmap',
  toolbarTools: MIND_MAP_TOOLS,
  createDefaultDocument: createDefaultMindMapDocument,
  layout: layoutMindMap,
}

export const builtInCanvasDocumentProfiles = {
  canvas: standardCanvasProfile,
  mindmap: mindMapCanvasProfile,
} as const

export function getCanvasDocumentProfile(kind: CanvasDocumentKind): AnyCanvasDocumentProfile | undefined {
  if (kind === 'canvas') return standardCanvasProfile
  if (kind === 'mindmap') return mindMapCanvasProfile
  return undefined
}

export function resolveCanvasInteractionMode(profile?: Pick<AnyCanvasDocumentProfile, 'interactionMode'> | null, fallback: CanvasInteractionMode = 'canvas'): CanvasInteractionMode {
  return profile?.interactionMode ?? fallback
}

export function toolsForCanvasProfile(profile?: Pick<AnyCanvasDocumentProfile, 'toolbarTools'> | null, fallback: CanvasTool[] = STANDARD_CANVAS_TOOLS): CanvasTool[] {
  return profile?.toolbarTools ?? fallback
}

export function applyCanvasDocumentProfileLayout<Options, NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  document: MinuCanvasDocument<NodeExtra, EdgeExtra>,
  profile: CanvasDocumentProfile<Options, NodeExtra, EdgeExtra>,
  options?: Options,
): MinuCanvasDocument<NodeExtra, EdgeExtra> {
  return profile.layout ? profile.layout(document, options) : document
}
