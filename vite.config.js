import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        cadastro: resolve(__dirname, 'cadastro.html'),
        detalhe: resolve(__dirname, 'detalhe.html'),
        gerenciar: resolve(__dirname, 'gerenciar.html')
      }
    }
  }
});
