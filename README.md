# @dpklabs/minucanvas

Reusable React canvas editor for JSON Canvas documents, with an MVP flowchart toolset inspired by Obsidian Canvas, Eraser, and Excalidraw.

## Goals

- JSON Canvas as the persistence foundation (`nodes` + `edges`).
- Simple controlled React API, similar to `@dpklabs/minueditor`.
- Extensible rendering hooks for service-specific node content and edge labels.
- Separate canvas/surface themes and shape themes via CSS variables.
- Base shape theme is a simple outline, including the dark mode style.
- MVP diagram tools: select, pan, text, rectangle, diamond, ellipse, pill, arrow, line.

## Install

```bash
npm install @dpklabs/minucanvas
```

Import the base styles:

```ts
import '@dpklabs/minucanvas/theme.css'
```

Optional explicit themes:

```ts
import '@dpklabs/minucanvas/themes/light.css'
import '@dpklabs/minucanvas/themes/dark.css'
```

## Basic usage

```tsx
import { useState } from 'react'
import { MinuCanvas, type JsonCanvasDocument } from '@dpklabs/minucanvas'
import '@dpklabs/minucanvas/theme.css'

const initial: JsonCanvasDocument = {
  nodes: [
    { id: 'a', type: 'text', text: 'Start', x: 0, y: 0, width: 160, height: 80, shape: 'pill' },
    { id: 'b', type: 'text', text: 'Done?', x: 260, y: -40, width: 240, height: 160, shape: 'diamond' },
  ],
  edges: [{ id: 'ab', fromNode: 'a', toNode: 'b', toEnd: 'arrow' }],
}

export function Example() {
  const [value, setValue] = useState(initial)

  return (
    <MinuCanvas
      value={value}
      onChange={setValue}
      canvasTheme="system"
      shapeTheme="outline"
      grid
      snapToGrid
      autoFit
    />
  )
}
```

## Local dev

```bash
npm install
npm run dev
```

The dev app runs on port `3334` and mirrors the editor package pattern: `dev/App.tsx`, `dev/main.tsx`, `vite.dev.config.ts`.

Dev pages:

- Standard demo: `http://localhost:3334/`
- Fullscreen demo: `http://localhost:3334/fullscreen.html`

## Arrows, lines, and connectors

Arrow and line tools are separate drawing tools, but both can function as connectors when started from a shape outline. Arrow endpoints persist logical anchors on nodes:

```ts
{
  fromNode: 'a',
  fromAnchor: { side: 'right', position: 0.82 },
  toNode: 'b',
  toAnchor: { side: 'left', position: 0.18 }
}
```

`position` is `0..1` along the selected side. When dragging near the middle of a side, the anchor snaps to `0.5`; otherwise it keeps the chosen edge position so multiple arrows/lines can attach to the same shape without crowding one midpoint.

With the arrow or line tool active, start drags from a shape outline/edge rather than the middle of the shape. Arrow creates an arrowhead; line creates a plain line. You can also start slightly outside the edge; the hit target resolves to the nearest outline point. Arrows/lines have an expanded invisible hit area, so selection and double-click label editing do not require pixel-perfect clicks. Select an arrow/line to reveal draggable start/end handles. Drag either handle to another point on a shape outline to reroute it. Double-click an arrow/line or its label to add/edit text.

## Adding connected shapes

Select a shape to reveal `+` affordances at each edge. Click one to create a new connected shape a standard distance away in that direction. If the target spot is occupied, the new shape nudges farther in that direction.

Keyboard equivalent: select one shape and press `Cmd/Ctrl + ArrowUp/Right/Down/Left`. Repeating the same shortcut fans multiple new shapes from the original source in that direction instead of creating a chain.

## Keyboard shortcuts

- `V` select
- `H` hand / pan
- `A` arrow
- `L` line
- `T` text
- `R` rectangle
- `D` diamond
- `O` ellipse
- `P` pill
- Arrow keys move selected nodes
- `Alt/Option+Arrow` navigate between nearby shapes/connectors
- `Tab` opens the selected node shape switcher
- `Enter` / `F2` edit selected label
- `Delete` / `Backspace` delete selection
- `Cmd/Ctrl+D` duplicate selection
- `Cmd/Ctrl +/-` zoom
- `Cmd/Ctrl+0` reset view
- `Cmd/Ctrl+Arrow` add a connected shape in that direction

## Themes

Canvas/surface theme and shape theme are intentionally separate:

```tsx
<MinuCanvas canvasTheme="dark" shapeTheme="outline" />
<MinuCanvas canvasTheme="light" shapeTheme="filled" />
```

Built-in canvas themes: `system`, `light`, `dark`.

Built-in shape themes: `outline`, `filled`, `soft`. `outline` is the default and keeps shapes as simple stroked objects with transparent fills.

Grid and snapping are also optional, and existing diagrams can be fit into view on mount:

```tsx
<MinuCanvas grid={false} snapToGrid={false} autoFit />
```

## MVP documentation

See [`docs/mvp-usage.md`](docs/mvp-usage.md) for current editing behavior, groups, layers, export, external paste/drop, host upload hooks, and a manual QA checklist.

See [`docs/minucanvas-json.md`](docs/minucanvas-json.md) for the MinuCanvas JSON persistence format and JSON Canvas compatibility notes.

See [`docs/minu-diagram-syntax.md`](docs/minu-diagram-syntax.md) for the proposed LLM-friendly diagram-as-code syntax. Parser/compiler helpers are available from `@dpklabs/minucanvas/syntax`.

## Releases

For reproducible GitHub-based installs, use release tags rather than a branch:

```bash
npm install github:spdydve/minucanvas#v0.1.0
```

Choose a version bump:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

These update `package.json` and `package-lock.json` without creating a git tag. Commit the version bump, then dry-run release validation:

```bash
npm run release:tag:dry-run
```

Create and push the annotated tag when validation passes:

```bash
npm run release:tag:push
```

The release script requires a clean worktree, verifies the tag does not already exist, runs `npm run check:release`, creates `v<package.json version>`, and optionally pushes the current branch and tag.

## Extensibility

- Add service-specific properties by typing `JsonCanvasDocument<NodeExtra, EdgeExtra>`.
- Use `renderNode` to render custom cards while keeping layout, selection, movement, and edge routing.
- Use `getNodeDefaults` to control newly-created nodes per tool.
- Use `onUpload` to persist pasted/dropped image files and return a durable URL.
- Use `onResolveLink` to enrich pasted/dropped URL nodes with host-provided labels.
- Override canvas variables like `--mc-canvas-bg`, `--mc-canvas-grid`, and `--mc-canvas-accent`.
- Override shape variables like `--mc-shape-fill`, `--mc-shape-stroke`, `--mc-shape-text`, and `--mc-line`.
