import './App.css';
import { useState } from 'react';
import Chatbot from './components/Chatbot';
import ArchitectureDiagram from './components/ArchitectureDiagram';

function App() {
  const [currentPage, setCurrentPage] = useState<'chat' | 'architecture'>('chat');

  return (
    <div className="app-container">
      <header>
        <h1>AI SDK</h1>
        <nav className="main-nav">
          <button
            className={currentPage === 'chat' ? 'active' : ''}
            onClick={() => setCurrentPage('chat')}
          >
            Chat
          </button>
          <button
            className={currentPage === 'architecture' ? 'active' : ''}
            onClick={() => setCurrentPage('architecture')}
          >
            Architecture
          </button>
        </nav>
      </header>

      <main>{currentPage === 'chat' ? <Chatbot /> : <ArchitectureDiagram />}</main>
      {currentPage === 'architecture' ? (
        <footer>
          <p>Built with React, AI SDK, and Vite</p>
          <div className="footer-links">
            <a href="https://sdk.vercel.ai/docs" target="_blank" rel="noopener noreferrer">
              AI SDK Docs
            </a>
            <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
              React
            </a>
            <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer">
              Vite
            </a>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

export default App;
