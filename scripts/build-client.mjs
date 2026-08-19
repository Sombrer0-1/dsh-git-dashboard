/**
 * Build the browser ModuleLoader client bundle.
 * Requires a deepseek-harness checkout that provides `packages/client/tsdown.client.ts`
 * (override with `DSH_CLIENT_PRESET` if the relative path does not match your layout).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientPreset = process.env.DSH_CLIENT_PRESET?.trim()
  || join(packageRoot, '../../../../packages/client/tsdown.client.ts')
const { clientBundle } = await import(pathToFileURL(clientPreset).href)
const configs = clientBundle('dsh-git-dashboard', ['lib/types/index.js'])({})
const clientConfigs = configs.filter(config => config.name === 'dsh-git-dashboard/client')
if (clientConfigs.length === 0) {
  console.error('build-client: no client config produced')
  process.exit(1)
}

process.chdir(packageRoot)
await build({
  config: false,
  ...clientConfigs[0],
  // Entry from TypeScript source so we do not require a green client tsc face.
  entry: { client: 'src/client/index.ts' },
})
console.log('build-client: wrote lib/client.js')
