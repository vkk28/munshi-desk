import { build } from 'esbuild'
import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.', import.meta.url))
await mkdir(new URL('dist/', import.meta.url), { recursive: true })
await build({
  absWorkingDir: directory,
  entryPoints: ['src/worker.ts', 'src/content.ts', 'src/panel.ts', 'src/permissions.ts'],
  outdir: 'dist', bundle: true, format: 'iife', target: 'chrome116', minify: true,
})
for (const asset of ['manifest.json', 'panel.html', 'panel.css', 'permissions.html']) {
  await cp(new URL(asset, import.meta.url), new URL('dist/' + asset, import.meta.url))
}
