#!/usr/bin/env node

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version
const tag = `v${version}`
const packageManager = process.env.npm_config_user_agent?.startsWith('pnpm/') ? 'pnpm' : 'npm'

const args = new Set(process.argv.slice(2))
const shouldPush = args.has('--push')
const isDryRun = args.has('--dry-run')

function run(command, commandArgs, options = {}) {
  const { capture = false } = options
  return execFileSync(command, commandArgs, {
    cwd: rootDir,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: capture ? 'utf8' : undefined,
  })
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

function getCurrentBranch() {
  return run('git', ['branch', '--show-current'], { capture: true }).trim()
}

function ensureCleanWorktree() {
  const status = run('git', ['status', '--porcelain'], { capture: true }).trim()
  if (!status) return
  fail('working tree is not clean. Commit or stash changes before tagging a release.')
}

function ensureTagDoesNotExist() {
  try {
    run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { capture: true })
    fail(`tag ${tag} already exists.`)
  } catch (error) {
    if (error.status === 1) return
    throw error
  }
}

function main() {
  if (!version) fail('package.json is missing a version.')

  const branch = getCurrentBranch()
  ensureCleanWorktree()
  ensureTagDoesNotExist()

  console.log(`release: validating ${tag} from branch ${branch || '(detached HEAD)'}`)
  run(packageManager, ['run', 'check:release'])

  if (isDryRun) {
    console.log(`release: dry run complete. ${tag} was not created.`)
    return
  }

  console.log(`release: creating tag ${tag}`)
  run('git', ['tag', '-a', tag, '-m', tag])

  if (shouldPush) {
    console.log(`release: pushing branch ${branch} and tag ${tag}`)
    run('git', ['push', 'origin', branch])
    run('git', ['push', 'origin', tag])
  }

  console.log(`release: created ${tag}`)
  if (!shouldPush) {
    console.log(`release: push it with 'git push origin ${branch}' and 'git push origin ${tag}' when ready.`)
  }
  console.log(`release: install with 'npm install github:spdydve/minucanvas#${tag}'`)
}

main()
