import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plain Vite + React setup. Output goes to dist/ (static, Vercel-ready).
export default defineConfig({
  plugins: [react()],
});
