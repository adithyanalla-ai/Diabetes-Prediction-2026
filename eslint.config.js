import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules', 'legacy', 'samples'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['server/**/*.js', 'api/**/*.js', 'scripts/**/*.js', 'vite.config.js', 'eslint.config.js', 'tests/**/*.js'], languageOptions: { globals: globals.node } },
];
