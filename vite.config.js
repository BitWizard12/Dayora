import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'timezone-vendor', test: /node_modules[\\/](?:@js-temporal[\\/]polyfill|jsbi)[\\/]/, priority: 20 },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/, priority: 15 },
          ],
        },
      },
    },
  },
})
