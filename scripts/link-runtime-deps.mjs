/**
 * Create local node_modules links so an out-of-tree plugin can resolve Host
 * peers from `$DSH_HOME/profiles/node_modules`.
 *
 * Node follows the real path of a linked package, so resolution never walks
 * the profile directory; these links recreate the peers beside the package.
 *
 * Windows: directory junction via `mklink /J`.
 * macOS / Linux: directory symbolic link.
 *
 * Usage:
 *   node scripts/link-runtime-deps.mjs
 */
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { homedir, platform } from 'node:os'

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

function removeExisting(link) {
  if (!existsSync(link)) return
  const st = lstatSync(link)
  if (st.isSymbolicLink() || st.isDirectory()) rmSync(link, { recursive: true, force: true })
  else rmSync(link, { force: true })
}

function linkPeer(link, target) {
  if (!existsSync(target)) {
    console.error(`link-runtime-deps: missing target ${target}`)
    process.exit(1)
  }
  removeExisting(link)
  if (platform() === 'win32') {
    const result = spawnSync('cmd', ['/c', 'mklink', '/J', link, target], { encoding: 'utf8' })
    if (result.status !== 0) {
      console.error(result.stdout)
      console.error(result.stderr)
      process.exit(result.status ?? 1)
    }
  } else {
    symlinkSync(target, link, 'dir')
  }
  console.log(`linked ${link} -> ${target}`)
}

for (const name of scoped) {
  linkPeer(join(scope, name), join(fallback, '@deepseek-ai', name))
}
linkPeer(join(nm, 'zod'), join(fallback, 'zod'))
console.log('link-runtime-deps: ok')
