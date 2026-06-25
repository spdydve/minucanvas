import { createDefaultMindMapDocument, layoutMindMap, type MindMapProfileOptions } from './mindmap'
import { emptyCanvas } from './model'
import type { AnyCanvasDocumentProfile, CanvasDocumentKind, CanvasDocumentProfile, CanvasInteractionMode, MinuCanvasDocument } from './types'

export const standardCanvasProfile: CanvasDocumentProfile = {
  kind: 'canvas',
  label: 'Canvas',
  interactionMode: 'canvas',
  createDefaultDocument: () => emptyCanvas(),
}

export const mindMapCanvasProfile: CanvasDocumentProfile<MindMapProfileOptions> = {
  kind: 'mindmap',
  label: 'Mind map',
  interactionMode: 'mindmap',
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

export function applyCanvasDocumentProfileLayout<Options, NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  document: MinuCanvasDocument<NodeExtra, EdgeExtra>,
  profile: CanvasDocumentProfile<Options, NodeExtra, EdgeExtra>,
  options?: Options,
): MinuCanvasDocument<NodeExtra, EdgeExtra> {
  return profile.layout ? profile.layout(document, options) : document
}
