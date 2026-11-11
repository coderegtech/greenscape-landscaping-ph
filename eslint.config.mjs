// Flat config for the whole monorepo: TypeScript, React hooks, Next.js and accessibility rules.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/generated/**', 'scripts/audit/**', 'docs/**', 'test-results/**', 'playwright-report/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', { selector: 'Literal[value=/transition-all/]', message: 'Design floor: never transition all properties (docs/ui-ux-guidelines.md).' }] },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}', 'apps/employee/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}', 'packages/auth/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, '@next/next': nextPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // labelled scroll regions (wide tables on phones) must be focusable for keyboard scrolling
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
      '@next/next/no-html-link-for-pages': 'off', // multi-app monorepo; the rule assumes one pages dir
    },
  },
);
