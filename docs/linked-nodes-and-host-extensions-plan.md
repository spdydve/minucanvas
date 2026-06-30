# Linked Nodes and Host Extension Plan

This plan covers generic node links, MinuNotes-linked canvas nodes, and the MinuCanvas core extension points needed to support them without making MinuCanvas depend on MinuNotes.

## Goals

- Let any canvas node optionally link to an external URL.
- Let host apps attach app-specific links, such as MinuNotes note/folder links, through typed node metadata.
- Keep JSON Canvas as the canonical persistence base.
- Keep MinuCanvas core generic and reusable.
- Make link affordances work well for mind maps, where a node should remain editable text but optionally open a resource.
- Add extension APIs so hosts can add badges, context menu actions, and link/open behavior without replacing the whole editor.

## Data model

### Generic external URL on any node

`CanvasNode.url` already exists and should be treated as a generic external link target for any node type, not only `type: 'link'` nodes.

```json
{
  "id": "node_1",
  "type": "text",
  "shape": "text",
  "text": "Competitor research",
  "url": "https://example.com/research",
  "x": 100,
  "y": 100,
  "width": 180,
  "height": 48
}
```

Distinction:

- `type: 'link'`: the link is the main content/card.
- any node with `url`: the node has its own canvas content, plus an attached external link.

This is especially important for mind maps: a topic can stay a normal text-note node, participate in layout and branch editing, and still open a reference URL.

### Host-specific links through node metadata

Host apps should use `CanvasNode<NodeExtra>` for app-specific link metadata.

For MinuNotes:

```ts
type MinuNotesNodeExtra = {
  minunotes?: {
    linkType?: 'note' | 'folder'
    noteId?: string
    folderId?: string
    icon?: string
  }
}
```

Example JSON:

```json
{
  "id": "node_1",
  "type": "text",
  "text": "Project Plan",
  "minunotes": {
    "linkType": "note",
    "noteId": "note_abc123"
  }
}
```

Core MinuCanvas should not know what `noteId` means. It should provide extension points for rendering and actions.

## Core MinuCanvas updates

### Phase 1 — Generic URL affordances

Add first-class UI behavior for `node.url` on any node.

Behavior:

- Render a small external-link badge on nodes with `url`.
- Badge click opens the URL.
- Context menu actions:
  - `Add link…` for nodes without `url`
  - `Edit link…` for nodes with `url`
  - `Open link`
  - `Remove link`
- Keyboard:
  - `Cmd/Ctrl+Enter` opens the selected node URL when exactly one linked node is selected.
- Double-click behavior should remain node-specific:
  - normal text/shape nodes still edit text
  - dedicated `type: 'link'` nodes can keep open-on-double-click behavior

Implementation notes:

- Use the existing `url?: string` field.
- Keep URL editing simple at first: `window.prompt` is acceptable for MVP if we do not want a full dialog yet.
- Do not draw a default outline for dedicated link nodes; linked regular nodes keep their normal shape rendering.

### Phase 2 — Host node adornments

Add a generic adornment slot so hosts can render note badges, folder badges, status pills, or icons without replacing the node renderer.

Proposed prop:

```ts
renderNodeAdornment?: (context: CanvasRenderNodeContext<NodeExtra>) => ReactNode
```

Rendering:

- Render inside the node wrapper, above content.
- Position as a small top-right overlay by default via a wrapper class.
- Multiple adornments can be returned by the host.
- Core URL badge can either use the same visual region internally or be rendered next to host adornments.

Example MinuNotes usage:

```tsx
<MinuCanvas
  renderNodeAdornment={({ node }) =>
    node.minunotes?.noteId ? <NoteBadge title="Open linked note" /> : null
  }
/>
```

### Phase 3 — Context menu extension actions

Add host-provided context menu actions. This lets MinuNotes add `Link to note…`, `Open linked note`, and `Remove note link` without forking the menu.

Proposed types:

```ts
type CanvasContextAction = {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}
```

Proposed props:

```ts
getNodeContextActions?: (context: {
  node: CanvasNode<NodeExtra>
  selection: CanvasSelection
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>
}) => CanvasContextAction[]

getCanvasContextActions?: (context: {
  selection: CanvasSelection
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>
}) => CanvasContextAction[]
```

Start with node actions only if we want to keep the first implementation small.

### Phase 4 — Generic node action hook

Add an action callback so badges/keyboard/menu can delegate semantic actions to host apps.

Proposed prop:

```ts
onNodeAction?: (action: string, node: CanvasNode<NodeExtra>) => void
```

Suggested built-in/core action names:

- `open-url`
- `edit-url`
- `remove-url`

Suggested host action names:

- `open-note`
- `link-note`
- `unlink-note`
- `open-folder`

Alternative: keep core URL actions internal and let host adornments/menu items call their own closures. The hook is useful if we want consistent keyboard handling for host actions later.

### Phase 5 — Syntax extension hooks

Keep Minu diagram syntax generic, but allow hosts to attach extra metadata during compilation.

Small core support:

```txt
Topic [url: "https://example.com"]
```

This should compile to a normal node with `url`.

Future extension hook:

```ts
compileMinuDiagramSyntax<MinuNotesNodeExtra>(source, {
  nodeExtra: ({ id, label, properties }) => {
    if (properties.noteId) {
      return { minunotes: { linkType: 'note', noteId: properties.noteId } }
    }
    return {}
  },
})
```

MinuNotes can then support pre-resolved note IDs:

```txt
Project [noteId: "note_abc123"]
```

Title/wiki resolution such as `[[Project Plan]]` should happen in MinuNotes before or during a host-provided compile hook, not in MinuCanvas core.

### Phase 6 — Optional icon metadata/rendering

Add a small, predictable icon capability after links/adornments are working.

Possible generic field:

```ts
style?: {
  icon?: string
}
```

Or keep icons as host metadata first:

```json
"minunotes": {
  "icon": "file-text",
  "noteId": "note_abc123"
}
```

Recommended first icon set:

- `file`
- `folder`
- `link`
- `idea`
- `check`
- `warning`
- `question`
- `person`
- `calendar`
- `tag`

Prefer a small curated set so agents and users can rely on stable names.

## MinuNotes updates enabled by these APIs

These belong in MinuNotes, not MinuCanvas core:

1. Add `minunotes.noteId` / `folderId` metadata to canvas nodes.
2. Render note/folder badges via `renderNodeAdornment`.
3. Add context menu actions via `getNodeContextActions`:
   - `Link to note…`
   - `Open linked note`
   - `Remove note link`
4. Index canvas links for backlinks/graph:
   - markdown links from markdown content
   - canvas links from `nodes[].minunotes.noteId`
5. Add harness helpers:
   - `POST /api/harness/notes/:noteId/canvas/nodes`
   - `PATCH /api/harness/notes/:noteId/canvas/nodes/:nodeId`
   - `POST /api/harness/notes/:noteId/canvas/nodes/:nodeId/link-note`
   - `DELETE /api/harness/notes/:noteId/canvas/nodes/:nodeId/link`
6. Add search/slash command UI:
   - `/link`
   - `/note`
   - `/icon`

## Recommended implementation order

1. Generic URL affordances on any node.
2. `renderNodeAdornment` host extension prop.
3. Host context menu action extension.
4. Syntax support/docs for `url` on any node.
5. MinuNotes linked-note badge/actions using the host extension APIs.
6. Canvas link indexing in MinuNotes backlinks/graph.
7. Harness helpers for agent-friendly canvas node linking.
8. Optional icon metadata/rendering.

## Open questions

- Should URL editing use a simple prompt for MVP or a small custom dialog?
- Should clicking a URL badge select the node first, open immediately, or require modifier-click?
- Should dedicated `type: 'link'` nodes and linked regular nodes share the same badge style?
- Should `Cmd/Ctrl+Enter` be reserved for opening links, or should host apps be able to override it for internal linked notes?
- Should host context actions support nested submenus immediately, or only flat lists for MVP?
