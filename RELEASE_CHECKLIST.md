# Release Checklist

## Before Tagging

1. Finish and commit code/docs changes.
2. Confirm the worktree is clean:

```bash
git status --short
```

3. Choose a version bump:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

4. Commit the version bump in `package.json` and `package-lock.json`.

## Release Validation

Dry-run the release without creating a tag:

```bash
npm run release:tag:dry-run
```

This verifies:

1. the worktree is clean
2. the `v<package.json version>` tag does not already exist
3. typecheck passes
4. tests pass
5. `dist/` is rebuilt from a clean state
6. required dist files and package export paths exist
7. no sourcemaps are emitted
8. `npm pack --dry-run` succeeds

## Tagging

Create the local annotated tag:

```bash
npm run release:tag
```

Create and push the current branch and tag:

```bash
npm run release:tag:push
```

## Consumer App Validation

Install from the tag in a consuming app:

```bash
npm install github:spdydve/minucanvas#v0.1.0
```

Verify imports:

```ts
import { MinuCanvas } from '@dpklabs/minucanvas'
import { compileMinuDiagramSyntax } from '@dpklabs/minucanvas/syntax'
import '@dpklabs/minucanvas/theme.css'
import '@dpklabs/minucanvas/themes/dark.css'
```

Verify runtime behavior:

1. canvas renders
2. base styles load
3. shape creation/editing works
4. connectors render and route correctly
5. syntax compiler import works
6. consumer app build succeeds

## Convenience Commands

Package-oriented check:

```bash
npm run check:package
```

Full release check:

```bash
npm run check:release
```
