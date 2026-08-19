import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

const here = fileURLToPath(new URL('.', import.meta.url))
const reactRoot = fileURLToPath(new URL(
  '../../../../node_modules/.pnpm/react@18.3.1/node_modules/react',
  import.meta.url,
))
const rtlRoot = fileURLToPath(new URL(
  '../../../../packages/client/ui-goal/node_modules/@testing-library/react',
  import.meta.url,
))

export default defineConfig({
  root: here,
  plugins: [tsconfigPaths({
    projects: [fileURLToPath(new URL('../../../../tsconfig.base.json', import.meta.url))],
  })],
  resolve: {
    alias: {
      react: reactRoot,
      'react/jsx-runtime': `${reactRoot}/jsx-runtime.js`,
      'react/jsx-dev-runtime': `${reactRoot}/jsx-dev-runtime.js`,
      '@testing-library/react': rtlRoot,
    },
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    pool: 'forks',
    testTimeout: 30_000,
  },
})
