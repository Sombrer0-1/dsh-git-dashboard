/**
 * Create local node_modules junctions so a `link:`-installed out-of-tree
 * plugin can resolve Host peers from `$DSH_HOME/profiles/node_modules`.
 *
 * Node follows the real path of a linked package, so resolution never walks
 * the profile directory; these junctions recreate the peers beside the package.
 *
 * Usage (Node 24):
 *   node scripts/link-runtime-deps.mjs
 */
import { existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const fallback = join(dshHome, 'profiles', 'node_modules')
const nm = join(packageRoot, 'node_modules')
const scope = join(nm, '@deepseek-ai')

const scoped = [
  'dsh-typert-protocol',
  'dsh-subprocess',
  'dsh-timeout',
  'dsh-workspace',
  'cordis',
  'schemastery',
]

if (!existsSync(fallback)) {
  console.error(`link-runtime-deps: missing ${fallback}`)
  console.error('Run `dsh web` once (or any profile boot) so dsh heals profiles/node_modules, then retry.')
  process.exit(1)
}

mkdirSync(scope, { recursive: true })

function junction(link, target) {
  if (!existsSync(target)) {
    console.error(`link-runtime-deps: missing target ${target}`)
    process.exit(1)
  }
  if (existsSync(link)) {
    const st = lstatSync(link)
    if (st.isSymbolicLink() || st.isDirectory()) rmSync(link, { recursive: true, force: true })
    else rmSync(link, { force: true })
  }
  const result = spawnSync('cmd', ['/c', 'mklink', '/J', link, target], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    process.exit(result.status ?? 1)
  }
  console.log(`linked ${link} -> ${target}`)
}

for (const name of scoped) {
  junction(join(scope, name), join(fallback, '@deepseek-ai', name))
}
junction(join(nm, 'zod'), join(fallback, 'zod'))
console.log('link-runtime-deps: ok')
