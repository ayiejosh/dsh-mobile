import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'

const clientBundle = new URL('../lib/client.js', import.meta.url)
const source = await readFile(clientBundle, 'utf8')
const imports = [...source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/gu)]
  .map(match => match[2])
const builtins = imports.filter(specifier => isBuiltin(specifier))
if (builtins.length > 0) {
  throw new Error(`Browser client bundle imports Node builtins: ${[...new Set(builtins)].join(', ')}`)
}
