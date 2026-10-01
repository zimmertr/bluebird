/**
 * Writes the browser half of the image's third-party license file (#571).
 *
 * MIT, ISC, BSD and Apache-2.0 each ask that a copy of the code carry its
 * license text, and the minified bundle keeps none of them. So the build names
 * every package that reaches the browser and writes each one's own license
 * file beside the bundle; the image's second stage appends the Python
 * packages (`backend/scripts/write_third_party_licenses.py`) and the pod
 * serves the result at `/third-party-licenses.txt`.
 *
 * The list is read off the build itself rather than off package.json or the
 * lockfile, because neither says what ships: most of the lockfile is build
 * tooling, and a dependency's own dependencies reach the bundle without being
 * named anywhere here. Vite 8 has the same idea built in (`build.license`) and
 * this plugin exists because that one does not cover three things this build
 * has: the MapLibre worker is a separate bundle its hook never sees, the two
 * stylesheets Tailwind inlines (`tailwindcss`, MapLibre's CSS) never enter the
 * module graph, and a package with no license file is written without its
 * text and without a word.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/** The file's name in `dist/`, and so the path the pod serves it at. */
export const NOTICE_FILE = 'third-party-licenses.txt'

/**
 * Files that ship in the image without passing through the bundle, by package.
 * The Dockerfile copies Swagger UI's files out of node_modules into
 * `static/swagger-ui/`, so no module graph ever sees them. A test holds this
 * map to the Dockerfile's COPY lines. A vendored file that is itself a bundle
 * carries its own notice as `<file>.LICENSE.txt` (webpack's convention), and
 * that joins the package's entry too, because the packages inside it are
 * named there and nowhere else.
 */
export const VENDORED_FILES: Record<string, string[]> = {
  'swagger-ui-dist': ['swagger-ui-bundle.js', 'swagger-ui.css'],
}

// LICENSE, LICENCE, COPYING and Apache's NOTICE, with or without an extension.
// NOTICE is here because Apache-2.0 section 4(d) requires it to travel too.
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-]|$)/i

export interface PackageNotice {
  name: string
  version: string
  license: string
  texts: { file: string; text: string }[]
}

/**
 * The directory of the package a module belongs to, or undefined for the
 * app's own source. The nearest package.json with a `name` decides, because
 * several packages (maplibre-gl, d3's) keep a nameless one in a subdirectory
 * only to set `"type"`.
 */
export function packageDirOf(moduleId: string): string | undefined {
  const path = moduleId.replace(/^\0/, '').split('?')[0]
  if (!path.includes('/node_modules/')) return undefined
  for (let dir = dirname(path); !dir.endsWith('/node_modules'); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name) return dir
    if (dir === dirname(dir)) break
  }
  return undefined
}

/**
 * The package names a stylesheet imports by bare specifier. Tailwind resolves
 * and inlines these itself, so they are visible here, in the source, and
 * nowhere after.
 */
export function cssImportPackages(css: string): string[] {
  const names: string[] = []
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    const spec = match[1]
    if (/^(\.|\/|[a-z]+:)/i.test(spec)) continue
    const parts = spec.split('/')
    names.push(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
  }
  return names
}

function licenseName(manifest: Record<string, unknown>): string {
  const { license, licenses } = manifest
  if (typeof license === 'string') return license
  if (license && typeof license === 'object' && 'type' in license) return String(license.type)
  if (Array.isArray(licenses)) return licenses.map((l) => l.type ?? l).join(' OR ')
  return 'unstated'
}

/**
 * One package's entry. A package's own license files win; a copy in
 * `upstream` fills in for a package that ships none; a package with neither
 * fails the build, because the alternative is a notice that silently leaves
 * it out.
 *
 * `upstream` is `plugins/licenses/`: texts copied from a package's own
 * repository, one file per package. victory-vendor is the one today, MIT per
 * its package.json with the text only at the Victory monorepo's root, which
 * npm never packs. A test fails once a package listed there starts shipping
 * its own, so the copy cannot outlive its reason.
 */
export function readPackageNotice(dir: string, upstream: string, vendored: string[] = []): PackageNotice {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const files = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file) && statSync(join(dir, file)).isFile())
    .sort()
  for (const file of vendored) {
    if (existsSync(join(dir, `${file}.LICENSE.txt`))) files.push(`${file}.LICENSE.txt`)
  }
  let texts = files.map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8').trim() }))
  const fallback = join(upstream, `${String(manifest.name).replace('/', '__')}.txt`)
  if (texts.length === 0 && existsSync(fallback)) {
    texts = [{ file: fallback, text: readFileSync(fallback, 'utf8').trim() }]
  }
  if (texts.length === 0) {
    throw new Error(
      `${manifest.name}@${manifest.version} reaches the image but ships no license file, ` +
        `so ${NOTICE_FILE} cannot carry its text. Copy the text from the package's own ` +
        `repository to ${fallback}.`,
    )
  }
  return { name: manifest.name, version: manifest.version, license: licenseName(manifest), texts }
}

const RULE = '='.repeat(78)

/** The section's text: one block per package, sorted by name then version. */
export function renderNotices(heading: string, notices: PackageNotice[]): string {
  const sorted = [...notices].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )
  const blocks = sorted.map((n) => {
    const body = n.texts
      .map((t) => (n.texts.length > 1 ? `--- ${t.file} ---\n\n${t.text}` : t.text))
      .join('\n\n')
    return `${RULE}\n${n.name} ${n.version}\nLicense: ${n.license}\n${RULE}\n\n${body}\n`
  })
  return `${heading}\n${'#'.repeat(heading.length)}\n\n${blocks.join('\n')}`
}

/**
 * The plugin pair: `main` for the app's build and `worker` for Vite's worker
 * builds, which share one record. Vite bundles a `?worker` import while it
 * loads the importing module, so every worker has written into the record
 * before the main bundle's `generateBundle` reads it.
 */
export function thirdPartyLicenses(root: string): { main: Plugin; worker: Plugin } {
  const dirs = new Set<string>()
  const collect = (bundle: Record<string, { type: string; moduleIds?: string[] }>) => {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue
      for (const id of output.moduleIds ?? []) {
        const dir = packageDirOf(id)
        if (dir) dirs.add(dir)
      }
    }
  }
  const worker: Plugin = {
    name: 'bluebird-forecast:third-party-licenses-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      collect(bundle)
    },
  }
  const main: Plugin = {
    name: 'bluebird-forecast:third-party-licenses',
    apply: 'build',
    // Before Vite's CSS plugin, which hands the source to Tailwind, so the
    // stylesheet's own @import lines are still there to read.
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css($|\?)/.test(id) || id.includes('/node_modules/')) return null
      for (const name of cssImportPackages(code)) dirs.add(join(root, 'node_modules', name))
      return null
    },
    generateBundle(_, bundle) {
      collect(bundle)
      const vendored = new Map(
        Object.entries(VENDORED_FILES).map(([name, files]) => [join(root, 'node_modules', name), files]),
      )
      for (const dir of vendored.keys()) dirs.add(dir)
      const notices = new Map<string, PackageNotice>()
      for (const dir of dirs) {
        const notice = readPackageNotice(dir, join(root, 'plugins', 'licenses'), vendored.get(dir))
        notices.set(`${notice.name}@${notice.version}`, notice)
      }
      this.emitFile({
        type: 'asset',
        fileName: NOTICE_FILE,
        source: renderNotices('npm packages', [...notices.values()]),
      })
    },
  }
  return { main, worker }
}
