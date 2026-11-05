import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')

/** Every file under the design system (and the app) that imports from 'lucide-react-native'. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

// Metro resolves 'lucide-react-native' to lucide-subset.js (see metro.config.js), so an icon missing there
// builds fine here and then breaks at runtime/bundling.
test('lucide-subset.js has every icon the design system and app import', () => {
  const subset = fs.readFileSync(path.join(root, 'lucide-subset.js'), 'utf8')
  const have = new Set([...subset.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]))
  const missing: string[] = []
  for (const file of [
    ...sources(path.join(root, 'packages/design')),
    ...sources(path.join(root, 'src')),
  ]) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'lucide-react-native'/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
        if (name && name !== 'LucideIcon' && !have.has(name))
          missing.push(`${name} (${path.relative(root, file)})`)
      }
    }
  }
  expect(missing).toEqual([])
})
