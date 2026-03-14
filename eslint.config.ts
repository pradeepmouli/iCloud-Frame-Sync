import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
	{ files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.node } },
	tseslint.configs.base,
	{ ignores: ["dist/**", "node_modules/**"] },
	{
		files: ["**/*.{ts,mts,cts,tsx}"],
		rules: {
			"no-unused-vars": "off",
			"no-undef": "off",
			"no-redeclare": "off",
		},
	},
	{
		files: ["**/*.{ts,mts,cts,tsx}"],
		plugins: { "@typescript-eslint": tseslint.plugin },
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
		},
	},
]);
