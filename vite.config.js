import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // @solana/web3.js is large; splitting it keeps the app chunk cacheable
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ['@solana/web3.js'],
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
