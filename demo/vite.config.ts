import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url))

// The demo imports the package by its public name; aliases point at the sources,
// so `npm run demo` works without a build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@notrealstudio/nr-nodes/core', replacement: src('core/index.ts') },
      { find: '@notrealstudio/nr-nodes/ui/styles', replacement: src('ui/styles/nodes.css') },
      { find: '@notrealstudio/nr-nodes/ui', replacement: src('ui/index.ts') },
    ],
  },
  server: { port: 5190, strictPort: true },
  build: { outDir: '../demo-dist', emptyOutDir: true },
})
