# MinuCanvas JSON

MinuCanvas JSON is a JSON Canvas-compatible document shape with MinuCanvas extensions for modern diagram editing.

The goal is to keep the simple `nodes` + `edges` foundation while preserving richer canvas features such as shapes, styling, precise connector anchors, groups, images, locking, and export behavior.

## Document

Current documents are stored as:

```ts
type JsonCanvasDocument = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}
```

Future documents may add an explicit format/version wrapper:

```ts
type MinuCanvasDocument = {
  format: 'minucanvas'
  version: 1
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}
```

For now, `nodes` and `edges` remain top-level for JSON Canvas compatibility.

## Node

Base JSON Canvas-compatible fields:

```ts
type CanvasNode = {
  id: string
  type: 'text' | 'file' | 'link' | 'group' | 'image'
  x: number
  y: number
  width: number
  height: number
  text?: string
  file?: string
  url?: string
  label?: string
  color?: string
  background?: string
}
```

### MinuCanvas node extensions

```ts
type CanvasNode = {
  shape?: CanvasShape
  style?: CanvasNodeStyle
  groupId?: string
  locked?: boolean
  imageWidth?: number
  imageHeight?: number
  imageStatus?: 'uploading' | 'failed'
  imageError?: string
}
```

### Node types

| Type | Meaning |
| --- | --- |
| `text` | Text or shape node. The visual shape is controlled by `shape`. |
| `link` | External/internal URL node. Uses `url`. |
| `file` | Generic file attachment node. Reserved for future broader file support. |
| `image` | Image node. Uses `file` or `url` as source. |
| `group` | Group/container node. Child nodes reference it via `groupId`. |

### Shapes

```ts
type CanvasShape =
  | 'text'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'pill'
  | 'diamond'
  | 'ellipse'
  | 'parallelogram'
  | 'hexagon'
```

`shape: 'text'` renders text without a visible container by default.

### Node style

```ts
type CanvasNodeStyle = {
  fill?: string
  stroke?: string
  text?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'sketch'
  borderRadius?: number
  opacity?: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: CSSProperties['fontWeight']
  textAlign?: CSSProperties['textAlign']
}
```

### Groups

Groups are represented as normal nodes with `type: 'group'`.

Children reference the group by ID:

```json
{
  "id": "child-1",
  "type": "text",
  "groupId": "group-1"
}
```

Group behavior:

- Clicking a grouped child selects/moves the group unless the group is actively being edited.
- Double-clicking a group enters group editing.
- Group bounds can auto-fit around children.
- Group labels render above-left of the group box.

### Images

Image nodes use `type: 'image'` and store the source in `file` or `url`:

```json
{
  "id": "image-1",
  "type": "image",
  "file": "https://example.com/image.png",
  "label": "image.png",
  "x": 100,
  "y": 100,
  "width": 640,
  "height": 360,
  "imageWidth": 1280,
  "imageHeight": 720
}
```

`imageWidth` and `imageHeight` are the natural dimensions when known.

`imageStatus` and `imageError` are intended for transient upload/error UI. Hosts may persist them, but durable saved documents should generally omit successful transient status fields.

## Edge

Base fields:

```ts
type CanvasEdge = {
  id: string
  fromNode: string
  toNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  label?: string
  color?: string
}
```

### MinuCanvas edge extensions

```ts
type CanvasEdge = {
  fromAnchor?: CanvasEdgeAnchor
  toAnchor?: CanvasEdgeAnchor
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  style?: CanvasEdgeStyle
}
```

### Precise anchors

```ts
type CanvasEdgeAnchor = {
  side: 'top' | 'right' | 'bottom' | 'left'
  position: number // 0..1 along the side
}
```

`fromSide` and `toSide` are retained for compatibility. `fromAnchor` and `toAnchor` provide more precise attachment points.

### Edge style

```ts
type CanvasEdgeStyle = {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'sketch'
  routing?: 'straight' | 'curved' | 'elbow'
  opacity?: number
}
```

## Persistence guidance

Recommended persisted fields:

- `nodes`
- `edges`
- all semantic/layout/style fields
- image natural dimensions
- group membership
- lock state

Recommended transient fields:

- `imageStatus`
- `imageError`
- active selection
- active group editing state
- viewport, unless a host explicitly wants to save it separately

## Strict JSON Canvas export

If strict JSON Canvas compatibility is needed later, add an exporter that maps/strips MinuCanvas extensions:

- Remove `style`, `shape`, `groupId`, `locked`, image metadata, precise anchors.
- Map `style.stroke` to `color` where possible.
- Map `shape` to generic text/group/file/link semantics where possible.
- Use `fromSide` / `toSide` as fallback for anchors.

This export will be lossy. Full fidelity requires MinuCanvas JSON.

## Relationship to diagram syntax

The proposed MinuCanvas diagram syntax compiles into MinuCanvas JSON. The syntax is optimized for authors and LLMs; MinuCanvas JSON is optimized for persistence and rendering.

See [`minu-diagram-syntax.md`](./minu-diagram-syntax.md).
