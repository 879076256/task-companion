import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.mts',
						'manifest.json',
						'scripts/*.mjs',
						'tests/*.test.mjs',
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['scripts/*.mjs', 'tests/*.test.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			'no-unsanitized/method': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/hardcoded-config-path': 'off',
		},
	},
	{
		files: ['src/settings/settings-tab.ts'],
		rules: {
			// Obsidian's published type definitions do not yet expose the
			// declarative settings API required by this advisory rule.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
);
