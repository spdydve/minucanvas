import type { CanvasEdgeRouting, CanvasEdgeStyle, CanvasNodeStyle, CanvasStrokeStyle } from '../types'
import type { MinuDiagramConnectionOperator, MinuDiagramDiagnostic, MinuDiagramGroup, MinuDiagramNode, ParsedMinuDiagram } from './types'

const CONNECTION_OPERATORS: MinuDiagramConnectionOperator[] = ['-->', '<>', '--', '>', '<', '-']
const EDGE_ROUTINGS = ['elbow', 'straight', 'curved'] as const
const EDGE_STROKE_STYLES = ['solid', 'dashed', 'dotted', 'sketch'] as const

interface ParseLine {
  text: string
  line: number
}

function stripComment(line: string): string {
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && line[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '/' && line[i + 1] === '/') return line.slice(0, i)
    if (!quoted && char === '#') return line.slice(0, i)
  }
  return line
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/\\"/g, '"')
  return trimmed
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === '"' && value[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0 && char === separator) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseProperties(source: string): Record<string, string> {
  const props: Record<string, string> = {}
  const body = source.trim().replace(/^\[/, '').replace(/\]$/, '')
  for (const part of splitTopLevel(body, ',')) {
    const index = part.indexOf(':')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = unquote(part.slice(index + 1).trim())
    if (key) props[key] = value
  }
  return props
}

function readTrailingProperties(text: string): { text: string; props: Record<string, string> } {
  const trimmed = text.trim()
  if (!trimmed.endsWith(']')) return { text: trimmed, props: {} }
  let quoted = false
  let depth = 0
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const char = trimmed[i]
    if (char === '"' && trimmed[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === ']') depth += 1
    if (!quoted && char === '[') {
      depth -= 1
      if (depth === 0) {
        return { text: trimmed.slice(0, i).trim(), props: parseProperties(trimmed.slice(i)) }
      }
    }
  }
  return { text: trimmed, props: {} }
}

function findTopLevelColon(text: string): number {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0 && char === ':') return i
  }
  return -1
}

function findConnectionOperator(text: string): MinuDiagramConnectionOperator | null {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (quoted || bracketDepth > 0) continue
    for (const op of CONNECTION_OPERATORS) {
      if (text.slice(i, i + op.length) === op) return op
    }
  }
  return null
}

function splitConnectionTokens(text: string): Array<string | MinuDiagramConnectionOperator> {
  const tokens: Array<string | MinuDiagramConnectionOperator> = []
  let current = ''
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0) {
      const op = CONNECTION_OPERATORS.find((candidate) => text.slice(i, i + candidate.length) === candidate)
      if (op) {
        if (current.trim()) tokens.push(current.trim())
        tokens.push(op)
        current = ''
        i += op.length - 1
        continue
      }
    }
    current += char
  }
  if (current.trim()) tokens.push(current.trim())
  return tokens
}

function propsToNode(id: string, props: Record<string, string>, groupId: string | undefined, line: number): MinuDiagramNode {
  const style = styleFromProps(props)
  return {
    id,
    label: props.label,
    type: props.type as MinuDiagramNode['type'] | undefined,
    shape: props.shape,
    url: props.url,
    file: props.file,
    width: numberProp(props.width),
    height: numberProp(props.height),
    color: props.color,
    style,
    groupId,
    line,
  }
}

function styleFromProps(props: Record<string, string>): CanvasNodeStyle | undefined {
  const style: CanvasNodeStyle = {}
  if (props.fill) style.fill = props.fill
  if (props.stroke) style.stroke = props.stroke
  if (props.text) style.text = props.text
  if (props.strokeWidth) style.strokeWidth = Number(props.strokeWidth)
  if (props.style) style.strokeStyle = props.style as CanvasStrokeStyle
  return Object.keys(style).length ? style : undefined
}

function numberProp(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeLines(source: string): ParseLine[] {
  return source.split(/\r?\n/).map((line, index) => ({ text: stripComment(line).trim(), line: index + 1 })).filter((line) => line.text.length > 0)
}

export function parseMinuDiagramSyntax(source: string): ParsedMinuDiagram {
  const diagnostics: MinuDiagramDiagnostic[] = []
  const nodes = new Map<string, MinuDiagramNode>()
  const groups = new Map<string, MinuDiagramGroup>()
  const connections: ParsedMinuDiagram['connections'] = []
  const groupStack: string[] = []
  const defaults: ParsedMinuDiagram['defaults'] = {}
  let title: string | undefined
  let direction: ParsedMinuDiagram['direction'] = 'down'
  let layout: ParsedMinuDiagram['layout']

  for (const entry of normalizeLines(source)) {
    let text = entry.text
    const diagramMatch = text.match(/^diagram\s+(?:"([^"]+)"|([^\s{]+))\s*\{?$/i)
    if (diagramMatch) {
      title = diagramMatch[1] ?? diagramMatch[2]
      continue
    }
    if (text === '}') {
      groupStack.pop()
      continue
    }

    const directionMatch = text.match(/^direction\s+(down|up|right|left)$/i)
    if (directionMatch) {
      direction = directionMatch[1].toLowerCase() as ParsedMinuDiagram['direction']
      continue
    }

    const layoutMatch = text.match(/^layout\s+(flow|mindmap)$/i)
    if (layoutMatch) {
      layout = layoutMatch[1].toLowerCase() as ParsedMinuDiagram['layout']
      continue
    }

    const defaultMatch = text.match(/^(colorMode|styleMode|typeface)\s+(.+)$/)
    if (defaultMatch) {
      defaults[defaultMatch[1] as keyof typeof defaults] = unquote(defaultMatch[2])
      continue
    }

    if (text.endsWith('{')) {
      text = text.slice(0, -1).trim()
      const { text: groupNameSource, props } = readTrailingProperties(text)
      const id = unquote(groupNameSource)
      if (!id) {
        diagnostics.push({ severity: 'error', message: 'Group name is required.', line: entry.line })
        continue
      }
      groups.set(id, { id, label: props.label, color: props.color, style: styleFromProps(props), parentGroupId: groupStack.at(-1), line: entry.line })
      groupStack.push(id)
      continue
    }

    if (findConnectionOperator(text)) {
      const { text: withoutProps, props } = readTrailingProperties(text)
      const colonIndex = findTopLevelColon(withoutProps)
      const expression = colonIndex === -1 ? withoutProps : withoutProps.slice(0, colonIndex).trim()
      const label = colonIndex === -1 ? undefined : unquote(withoutProps.slice(colonIndex + 1).trim())
      const tokens = splitConnectionTokens(expression)
      for (let i = 0; i < tokens.length - 2; i += 2) {
        const left = tokens[i]
        const op = tokens[i + 1]
        const right = tokens[i + 2]
        if (typeof left !== 'string' || typeof op !== 'string' || typeof right !== 'string') continue
        const leftIds = splitTopLevel(left, ',').map(unquote)
        const rightIds = splitTopLevel(right, ',').map(unquote)
        for (const from of leftIds) {
          for (const to of rightIds) {
            connections.push({ from, to, operator: op as MinuDiagramConnectionOperator, label, color: props.color, style: edgeStyleFromProps(props, diagnostics, entry.line), line: entry.line })
            ensureNode(nodes, from, groupStack.at(-1), entry.line)
            ensureNode(nodes, to, groupStack.at(-1), entry.line)
          }
        }
      }
      continue
    }

    const { text: idSource, props } = readTrailingProperties(text)
    for (const idPart of splitTopLevel(idSource, ',')) {
      const id = unquote(idPart)
      if (!id) continue
      nodes.set(id, { ...ensureNode(nodes, id, groupStack.at(-1), entry.line), ...propsToNode(id, props, groupStack.at(-1), entry.line) })
    }
  }

  return { title, direction, layout, nodes: [...nodes.values()], groups: [...groups.values()], connections, defaults, diagnostics }
}

function edgeStyleFromProps(props: Record<string, string>, diagnostics: MinuDiagramDiagnostic[], line: number): CanvasEdgeStyle | undefined {
  const style: CanvasEdgeStyle = {}
  if (props.color) style.stroke = props.color
  if (props.stroke) style.stroke = props.stroke
  if (props.strokeWidth) style.strokeWidth = Number(props.strokeWidth)
  if (props.style) {
    if (EDGE_STROKE_STYLES.includes(props.style as CanvasStrokeStyle)) style.strokeStyle = props.style as CanvasStrokeStyle
    else diagnostics.push({ severity: 'warning', message: `Unsupported edge style "${props.style}". Expected solid, dashed, dotted, or sketch.`, line })
  }
  const routing = props.routing ?? props.route ?? props.lineType
  if (routing) {
    if (EDGE_ROUTINGS.includes(routing as CanvasEdgeRouting)) style.routing = routing as CanvasEdgeRouting
    else diagnostics.push({ severity: 'warning', message: `Unsupported edge routing "${routing}". Expected elbow, straight, or curved.`, line })
  }
  return Object.keys(style).length ? style : undefined
}

function ensureNode(nodes: Map<string, MinuDiagramNode>, id: string, groupId: string | undefined, line: number): MinuDiagramNode {
  const existing = nodes.get(id)
  if (existing) return existing
  const node: MinuDiagramNode = { id, groupId, line }
  nodes.set(id, node)
  return node
}
