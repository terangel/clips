import { defineConfig } from 'rollup';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
    input: 'index.js',
    output: [
        {
            file: `dist/clips-${pkg.version}.esm.min.js`,
            format: 'es',
            sourcemap: false,
            plugins: [terser()]
        },
        {
            file: `dist/clips-${pkg.version}.min.js`,
            format: 'iife',
            name: 'clips',
            sourcemap: false,
            plugins: [terser()]
        }
    ],
    watch: {
        clearScreen: false
    }
});