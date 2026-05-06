import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    include: ['tests/integration/*.smoke.test.ts'],
    environment: 'node',
  },
});
