import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    publicDir: resolve('src/renderer/public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src'),
        // Force all nested copies of react-compose-refs to use our patched root copy.
        // Without this, 6+ nested copies inside other @radix-ui/* packages use their
        // own unpatched version, causing infinite setState loops in useComposedRefs.
        '@radix-ui/react-compose-refs': resolve(
          'node_modules/@radix-ui/react-compose-refs'
        )
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
