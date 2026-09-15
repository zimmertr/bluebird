import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  // The package lives two levels down so it can carry its own TypeScript (see
  // package.json), but the run happens from frontend/: ESLint reads a
  // `--config` file's patterns against the working directory, not against the
  // file's own folder, so `npm run lint` in frontend/ is the only invocation
  // these paths are correct for.
  { ignores: ['dist/**', 'node_modules/**', 'tools/**', 'public/**'] },

  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The pair the disable comments in this repo were written against, and
      // which nothing ran until now. Both are errors: a hook called
      // conditionally is a crash, and a dependency list that lies is a stale
      // render nobody sees until a reader hits it. The URL sync effect in
      // App.tsx was exactly that, silently, until this rule was switched on.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // A leading underscore is how this codebase already says "declared
      // because the position needs filling, never read" — the same signal
      // tsconfig's noUnusedParameters honours — so the linter reads it the
      // same way rather than asking for a second spelling.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    // Recharts hands its chart callbacks internal state objects, and the types
    // it publishes for them do not describe what the payload actually carries:
    // `MouseHandlerDataParam` has no `chartY`, which the pointer handler reads
    // and which is present at run time. Retyping that boundary is a change of
    // its own rather than a lint fix, so the rule is lifted here alone and
    // keeps working in every other file.
    files: ['src/components/TimeSeriesChart.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]
