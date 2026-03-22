import { defineConfig } from 'rollup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
    input: 'index.js',
    output: [
        {
            file: `dist/clips-${pkg.version}.esm.js`,
            format: 'es',
            sourcemap: 'inline'
        },
        {
            file: `dist/clips-${pkg.version}.js`,
            format: 'iife',
            name: 'clips',
            sourcemap: 'inline'
        }
    ],
    watch: {
        clearScreen: false
    }
});