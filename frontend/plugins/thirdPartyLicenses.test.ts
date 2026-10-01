import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NOTICE_FILE,
  VENDORED_FILES,
  cssImportPackages,
  packageDirOf,
  readPackageNotice,
  renderNotices,
  thirdPartyLicenses,
} from './thirdPartyLicenses'

const FRONTEND = join(import.meta.dirname, '..')

/** Writes `files` (path relative to the root, then contents) under a fresh root. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'notices-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  return root
}

const pkg = (name: string, version = '1.0.0', license = 'MIT') =>
  JSON.stringify({ name, version, license })

describe('packageDirOf', () => {
  it('answers the nearest package.json that names a package, past a nameless one', () => {
    const root = tree({
      'node_modules/maplibre-gl/package.json': pkg('maplibre-gl'),
      'node_modules/maplibre-gl/dist/package.json': '{"type":"module"}',
      'node_modules/maplibre-gl/dist/maplibre-gl.mjs': '',
    })
    expect(packageDirOf(join(root, 'node_modules/maplibre-gl/dist/maplibre-gl.mjs'))).toBe(
      join(root, 'node_modules/maplibre-gl'),
    )
  })

  it('reads a scoped package, a virtual module and a query string', () => {
    const root = tree({
      'node_modules/@reduxjs/toolkit/package.json': pkg('@reduxjs/toolkit'),
      'node_modules/@reduxjs/toolkit/dist/index.js': '',
    })
    const id = `\0${join(root, 'node_modules/@reduxjs/toolkit/dist/index.js')}?worker&url`
    expect(packageDirOf(id)).toBe(join(root, 'node_modules/@reduxjs/toolkit'))
  })

  it('answers nothing for the app’s own source', () => {
    expect(packageDirOf('/repo/frontend/src/App.tsx')).toBeUndefined()
  })
})

describe('cssImportPackages', () => {
  it('names the package behind each bare import and skips relative ones', () => {
    const css = [
      '@import "tailwindcss";',
      '@import "maplibre-gl/dist/maplibre-gl.css" layer(base);',
      "@import url('@scope/pkg/x.css');",
      '@import "./local.css";',
      '@import "https://example.test/a.css";',
    ].join('\n')
    expect(cssImportPackages(css)).toEqual(['tailwindcss', 'maplibre-gl', '@scope/pkg'])
  })
})

describe('readPackageNotice', () => {
  it('carries every license and NOTICE file the package ships', () => {
    const root = tree({
      'p/package.json': pkg('p', '2.0.0', 'Apache-2.0'),
      'p/LICENSE': 'apache text',
      'p/NOTICE': 'notice text',
      'p/README.md': 'not a license',
    })
    expect(readPackageNotice(join(root, 'p'), join(root, 'up'))).toEqual({
      name: 'p',
      version: '2.0.0',
      license: 'Apache-2.0',
      texts: [
        { file: 'LICENSE', text: 'apache text' },
        { file: 'NOTICE', text: 'notice text' },
      ],
    })
  })

  it('adds the notice a vendored bundle carries beside itself', () => {
    const root = tree({
      'p/package.json': pkg('p'),
      'p/LICENSE': 'own text',
      'p/bundle.js.LICENSE.txt': 'bundled packages',
    })
    expect(readPackageNotice(join(root, 'p'), join(root, 'up'), ['bundle.js']).texts).toEqual([
      { file: 'LICENSE', text: 'own text' },
      { file: 'bundle.js.LICENSE.txt', text: 'bundled packages' },
    ])
  })

  it('falls back to a committed upstream copy only when the package ships none', () => {
    const root = tree({
      'p/package.json': pkg('@s/p'),
      'up/@s__p.txt': 'upstream text\n',
    })
    expect(readPackageNotice(join(root, 'p'), join(root, 'up')).texts.map((t) => t.text)).toEqual([
      'upstream text',
    ])
  })

  it('fails, naming the package, when there is no text anywhere', () => {
    const root = tree({ 'p/package.json': pkg('bare', '3.1.4') })
    expect(() => readPackageNotice(join(root, 'p'), join(root, 'up'))).toThrow(
      /bare@3\.1\.4 reaches the image but ships no license file/,
    )
  })
})

describe('renderNotices', () => {
  it('writes one block per package, sorted, with the file name only when there are several', () => {
    const text = renderNotices('npm packages', [
      { name: 'b', version: '1.0.0', license: 'MIT', texts: [{ file: 'LICENSE', text: 'B' }] },
      {
        name: 'a',
        version: '2.0.0',
        license: 'Apache-2.0',
        texts: [
          { file: 'LICENSE', text: 'A' },
          { file: 'NOTICE', text: 'N' },
        ],
      },
    ])
    expect(text.startsWith('npm packages\n############\n\n')).toBe(true)
    expect(text.indexOf('\na 2.0.0\nLicense: Apache-2.0\n')).toBeLessThan(text.indexOf('\nb 1.0.0\n'))
    expect(text).toContain('--- NOTICE ---\n\nN')
    expect(text).not.toContain('--- LICENSE ---\n\nB')
  })
})

describe('thirdPartyLicenses', () => {
  type Hook = (...args: unknown[]) => unknown
  const run = (root: string, mainIds: string[], workerIds: string[], css: Record<string, string>) => {
    const { main, worker } = thirdPartyLicenses(root)
    ;(worker.generateBundle as Hook).call({}, {}, { 'w.js': { type: 'chunk', moduleIds: workerIds } })
    for (const [id, code] of Object.entries(css)) (main.transform as Hook).call({}, code, id)
    const emitted: { fileName: string; source: string }[] = []
    ;(main.generateBundle as Hook).call(
      { emitFile: (f: { fileName: string; source: string }) => emitted.push(f) },
      {},
      {
        'a.js': { type: 'chunk', moduleIds: mainIds },
        'a.css': { type: 'asset' },
      },
    )
    return emitted
  }
  const vendored = Object.fromEntries(
    Object.keys(VENDORED_FILES).flatMap((name) => [
      [`node_modules/${name}/package.json`, pkg(name)],
      [`node_modules/${name}/LICENSE`, `${name} text`],
    ]),
  )

  it('lists the main graph, the worker graph, the stylesheet imports and the vendored files', () => {
    const root = tree({
      ...vendored,
      'node_modules/app-dep/package.json': pkg('app-dep'),
      'node_modules/app-dep/LICENSE': 'app-dep text',
      'node_modules/worker-dep/package.json': pkg('worker-dep'),
      'node_modules/worker-dep/LICENSE.md': 'worker-dep text',
      'node_modules/css-dep/package.json': pkg('css-dep'),
      'node_modules/css-dep/COPYING': 'css-dep text',
    })
    const emitted = run(
      root,
      [join(root, 'src/main.tsx'), join(root, 'node_modules/app-dep/index.js')],
      [join(root, 'node_modules/worker-dep/w.mjs')],
      { [join(root, 'src/index.css')]: '@import "css-dep";' },
    )
    expect(emitted).toHaveLength(1)
    expect(emitted[0].fileName).toBe(NOTICE_FILE)
    for (const name of ['app-dep', 'worker-dep', 'css-dep', ...Object.keys(VENDORED_FILES)]) {
      expect(emitted[0].source).toContain(`\n${name} 1.0.0\n`)
      expect(emitted[0].source).toContain(`${name} text`)
    }
  })

  it('fails the build when a bundled package has no license text', () => {
    const root = tree({ ...vendored, 'node_modules/bare/package.json': pkg('bare') })
    expect(() => run(root, [join(root, 'node_modules/bare/index.js')], [], {})).toThrow(/bare@1\.0\.0/)
  })
})

describe('the repository around the plugin', () => {
  it('lists exactly the files the Dockerfile copies out of node_modules', () => {
    const dockerfile = readFileSync(join(FRONTEND, '../Dockerfile'), 'utf8')
    const copied: Record<string, string[]> = {}
    for (const [, name, file] of dockerfile.matchAll(/\/app\/frontend\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\/(\S+)/g)) {
      // The license files beside them are copied for the notice, not described by it.
      if (/^(LICENSE|NOTICE)$|\.LICENSE\.txt$/.test(file)) continue
      ;(copied[name] ??= []).push(file)
    }
    expect(copied).toEqual(VENDORED_FILES)
  })

  it('copies every license file a vendored package ships into the image beside its files', () => {
    const dockerfile = readFileSync(join(FRONTEND, '../Dockerfile'), 'utf8')
    for (const [name, files] of Object.entries(VENDORED_FILES)) {
      const dir = join(FRONTEND, 'node_modules', name)
      const own = readdirSync(dir).filter((f) => /^(licen[cs]e|notice)([.-]|$)/i.test(f))
      const bundled = files.map((f) => `${f}.LICENSE.txt`).filter((f) => existsSync(join(dir, f)))
      for (const file of [...own, ...bundled]) {
        expect(dockerfile).toContain(`/app/frontend/node_modules/${name}/${file}`)
      }
    }
  })

  it('keeps an upstream copy only for a package that still ships no license of its own', () => {
    const upstream = join(FRONTEND, 'plugins/licenses')
    for (const file of readdirSync(upstream)) {
      const dir = join(FRONTEND, 'node_modules', file.replace(/\.txt$/, '').replace('__', '/'))
      expect(existsSync(join(dir, 'package.json')), `${file} names an installed package`).toBe(true)
      const own = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(f))
      expect(own, `${file} is no longer needed: the package ships its own`).toEqual([])
    }
  })
})
