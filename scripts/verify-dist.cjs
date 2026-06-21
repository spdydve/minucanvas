const fs = require('fs')

const required = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/syntax.js',
  'dist/syntax.cjs',
  'dist/syntax.d.ts',
  'dist/theme.css',
  'dist/themes/light.css',
  'dist/themes/dark.css',
]

const missing = required.filter((file) => !fs.existsSync(file))
if (missing.length > 0) {
  console.error(`Missing dist files:\n${missing.join('\n')}`)
  process.exit(1)
}

const maps = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(file)
    else if (file.endsWith('.map')) maps.push(file)
  }
}

walk('dist')

if (maps.length > 0) {
  console.error(`Unexpected sourcemaps in dist:\n${maps.join('\n')}`)
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const exportTargets = [
  packageJson.main,
  packageJson.module,
  packageJson.types,
  packageJson.exports?.['.']?.types,
  packageJson.exports?.['.']?.import,
  packageJson.exports?.['.']?.require,
  packageJson.exports?.['./syntax']?.types,
  packageJson.exports?.['./syntax']?.import,
  packageJson.exports?.['./syntax']?.require,
  packageJson.exports?.['./theme.css'],
  packageJson.exports?.['./themes/light.css'],
  packageJson.exports?.['./themes/dark.css'],
].filter(Boolean)

const missingExports = exportTargets
  .map((target) => String(target).replace(/^\.\//, ''))
  .filter((target) => !fs.existsSync(target))

if (missingExports.length > 0) {
  console.error(`Package exports point to missing files:\n${missingExports.join('\n')}`)
  process.exit(1)
}

const bundledReactMarkers = [
  'react.production.min',
  'react.development.js',
  'react-jsx-runtime.production.min',
]

for (const file of ['dist/index.js', 'dist/index.cjs']) {
  const contents = fs.readFileSync(file, 'utf8')
  const marker = bundledReactMarkers.find((value) => contents.includes(value))
  if (marker) {
    console.error(`React appears to be bundled in ${file}. Matched marker: ${marker}`)
    process.exit(1)
  }
}

console.log('dist verified')
