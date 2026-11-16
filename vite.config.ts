import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from https://chriskuech.github.io/visualizer/
  base: '/visualizer/',
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
