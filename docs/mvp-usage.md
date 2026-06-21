# MinuCanvas MVP Usage Notes

## Core editing

- Select: click a shape, text, image, link, group, line, or arrow.
- Multi-select: `Shift` + click items, or drag a marquee selection box with the select tool.
- Move: drag selected items, or use arrow keys. With snap enabled, arrow movement uses the grid size.
- Pan: use the hand tool, hold `Shift`/`Space`, middle mouse, or two-finger trackpad scroll.
- Zoom: pinch/ctrl-wheel/meta-wheel zooms the canvas around the pointer.
- Resize: drag selected item resize handles.
- Add connected shapes: select a non-group shape and click a `+` handle, or use `Cmd/Ctrl + Arrow`.

## Text, links, and images

### Text shapes

The text tool creates a true text shape with no visible container by default. It shows a dashed outline while selected or editing.

### Link nodes

Pasting/dropping a normal URL creates a compact link node. Link labels default to the URL hostname. Hosts can optionally resolve better labels with:

```tsx
<MinuCanvas
  onResolveLink={async (url) => ({ label: 'Resolved title' })}
/>
```

Double-click a link node or use the context menu `Open link` action to open it.

### Image nodes

Pasting/dropping an image file or image URL creates an image node. Image nodes use the image dimensions, scaled down to a reasonable maximum if needed, and do not render a shape outline.

The upload API is generic so future non-image files can reuse it:

```tsx
<MinuCanvas
  onUpload={async (file) => {
    // Upload to app storage and return a durable URL.
    return uploadedUrl
  }}
/>
```

For local demos, object URLs are acceptable but not persistent:

```tsx
async function handleDemoUpload(file: File) {
  return URL.createObjectURL(file)
}
```

If no `onUpload` is provided, image paste/drop is ignored by default and emits a warning. You can allow inline base64/data URLs for demos only:

```tsx
<MinuCanvas allowInlineImages />
```

Warnings can be handled with:

```tsx
<MinuCanvas
  onExternalContentWarning={(warning) => console.warn(warning.message, warning)}
/>
```

## Groups

- Group: select two or more shapes and use `Cmd/Ctrl+G` or context menu `Group selection`.
- Ungroup: `Cmd/Ctrl+Shift+G` or context menu `Ungroup`.
- Click a grouped child to select/move the group.
- Double-click a group to enter group editing.
- In group editing mode, child shapes can be selected and moved independently.
- Click `Done` in the group breadcrumb or press `Escape` to exit group editing.
- Group bounds auto-fit around children when children are moved/resized inside the group.
- Double-click the group label above-left to rename it.

## Layers and locking

Context menu actions:

- Change order → Bring to front
- Change order → Bring forward
- Change order → Send backward
- Change order → Send to back
- Lock
- Unlock

Locked nodes can be selected, but cannot be moved, resized, or deleted by normal delete selection.

## Alignment and distribution

Context menu actions:

- Align → Left / Center / Right / Top / Middle / Bottom
- Distribute → Horizontal / Vertical

Smart alignment guides appear while dragging shapes. With snap-to-grid enabled, guides are visual only so they do not fight grid snapping. With snap-to-grid disabled, guides also snap.

## Export

Use context menu `Export…` to open the export dialog.

Supported:

- Area: Canvas or Selection
- File type: PNG image or SVG
- PNG quality: 1x / 2x / 3x
- PNG background: Solid / Transparent
- Color mode: Dark / Light

Imperative API:

```tsx
const canvasRef = useRef<CanvasHandle>(null)

const svg = canvasRef.current?.exportSvg()
const pngDataUrl = await canvasRef.current?.exportPng()
```

Notes:

- SVG export is safest for external images.
- PNG export may be limited by browser canvas security if external images are cross-origin and do not allow CORS.

## Manual QA checklist

1. Create each shape tool: text, rectangle, diamond, ellipse, pill.
2. Create arrows and lines between shapes. Edges default to elbow routing and can be changed to straight or curved from the style toolbar. Select an elbow edge and drag a horizontal or vertical segment to adjust line positioning.
3. Select, multi-select, marquee-select shapes and connectors.
4. Move items with mouse and arrow keys.
5. Resize shapes and groups.
6. Use copy, cut, paste, duplicate, undo, redo.
7. Group and ungroup shapes.
8. Enter a group, move a child, and exit with Done/Escape.
9. Rename a group label.
10. Lock and unlock nodes.
11. Use layer ordering commands.
12. Align and distribute selected nodes.
13. Drag with snap-to-grid on and off to verify guides.
14. Paste/drop plain text, URLs, image URLs, and local image files.
15. Replace an image and resize image to 25%, 50%, 100%.
16. Export canvas and selection as SVG and PNG.
17. Verify fullscreen and standard demos both behave consistently.
