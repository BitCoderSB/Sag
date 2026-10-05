import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { target: 'es2022', sourcemap: false, rollupOptions: { output: { manualChunks: { 'react-vendor': ['react', 'react-dom', 'react-dom/client'], 'accessible-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'] } } } },
});
