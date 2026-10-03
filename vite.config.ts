import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // O orçamento de 50 ms por caso do fuzz de terminação (F0.2) mede tempo de
    // parede: com muitos workers em paralelo o agendamento do SO vira ruído.
    // Limitar o paralelismo mantém a medição justa sem enfraquecer o limite.
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 }
    }
  }
});
