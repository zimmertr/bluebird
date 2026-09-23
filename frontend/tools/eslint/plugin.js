// The checks under checks/ used to be Vitest files that imported a source with
// `?raw` and searched its text. A test like that runs only on `npm test`,
// names a failing `it` rather than a line, and cannot tell code from a comment
// about it. Each check here is one rule, so a violation is underlined in the
// editor on the node it is on, and the rule's name says which invariant broke.
//
// A check has two halves, and either may be empty:
//
// - `ban`: selectors that must match nothing. Each match is reported where it
//   is.
// - `balance`: pairs of selectors that must match the same number of times,
//   and at least once: one thing that must always come with another.
// - `require`: selectors that must match, `count` times exactly or at least
//   `min` times (one by default). A shortfall is reported on the file's first
//   line, because the violation is an absence and has no node of its own.
//
// Rule options replace rather than merge in a flat config, which is why every
// check is a rule of its own rather than a list handed to no-restricted-syntax:
// two checks over one file would otherwise overwrite each other.

// A string literal or a template chunk whose text matches the pattern. The
// bans in eslint.config.js read strings the same way, and for the same reason:
// the pattern is about what the code says, not about a comment beside it.
export const text = (pattern, flags = '') =>
  [
    `Literal[value=/${pattern}/${flags}]`,
    `TemplateElement[value.raw=/${pattern}/${flags}]`,
    `JSXText[value=/${pattern}/${flags}]`,
  ].join(', ')

// An identifier by name, wherever it is read or declared.
export const named = (name) => `Identifier[name="${name}"]`

// A call to a function by its bare name, or as a method of anything.
export const calls = (name) =>
  `CallExpression[callee.name="${name}"], CallExpression[callee.property.name="${name}"]`

function bounds(want) {
  if (want.count !== undefined) return [want.count, want.count, `exactly ${want.count}`]
  const min = want.min ?? 1
  return [min, want.max ?? Infinity, want.max === undefined ? `at least ${min}` : `${min} to ${want.max}`]
}

function rule(check) {
  const bans = check.ban ?? []
  const wants = check.require ?? []
  const pairs = check.balance ?? []
  return {
    meta: { type: 'problem', schema: [], docs: { description: check.name } },
    create(context) {
      const listeners = {}
      const on = (selector, fn) => {
        const prev = listeners[selector]
        listeners[selector] = prev ? (node) => (prev(node), fn(node)) : fn
      }
      for (const b of bans) on(b.selector, (node) => context.report({ node, message: b.message }))
      const counts = wants.map(() => 0)
      wants.forEach((w, i) => on(w.selector, () => (counts[i] += 1)))
      const sides = pairs.map(() => [0, 0])
      pairs.forEach((p, i) =>
        p.selectors.forEach((sel, side) => on(sel, () => (sides[i][side] += 1))),
      )
      on('Program:exit', (program) => {
        pairs.forEach((p, i) => {
          const [a, b] = sides[i]
          if (a === b && a > 0) return
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            message: `${p.message} (found ${a} and ${b})`,
          })
        })
        wants.forEach((w, i) => {
          const [min, max, said] = bounds(w)
          if (counts[i] >= min && counts[i] <= max) return
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            message: `${w.message} (found ${counts[i]}, want ${said})`,
          })
        })
      })
      return listeners
    },
  }
}

// One plugin carrying every check, and the config blocks that hand each check
// to its own files.
export function checksPlugin(checks) {
  const names = new Set()
  for (const c of checks) {
    if (names.has(c.name)) throw new Error(`two checks are named ${c.name}`)
    names.add(c.name)
  }
  const plugin = { rules: Object.fromEntries(checks.map((c) => [c.name, rule(c)])) }
  const blocks = checks.map((c) => ({
    files: c.files,
    ...(c.ignores ? { ignores: c.ignores } : {}),
    plugins: { bluebird: plugin },
    rules: { [`bluebird/${c.name}`]: 'error' },
  }))
  return { plugin, blocks }
}

// Every message a check can report, which is what its fixture must produce.
export const messagesOf = (check) => [
  ...(check.ban ?? []).map((b) => b.message),
  ...(check.require ?? []).map((w) => w.message),
  ...(check.balance ?? []).map((p) => p.message),
]
