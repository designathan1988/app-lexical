import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializeContext } from './useEngine';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root não encontrado');
root.textContent = 'Carregando a base de conhecimento…';
initializeContext().then(() => {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}, (error: Error) => {
  root.textContent = `Falha ao iniciar a aplicação: ${error.message}`;
});
