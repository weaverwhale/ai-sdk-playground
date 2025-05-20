import './App.css';
import Chatbot from './components/Chatbot';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import { Route, Routes, NavLink, useLocation } from 'react-router';

function App() {
  const location = useLocation();
  const currentPage = location.pathname;

  return (
    <div className="app-container">
      <header>
        <h1>AI SDK</h1>
        <nav className="main-nav">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? 'active nav-button' : 'nav-button')}
          >
            Chat
          </NavLink>
          <NavLink
            to="/architecture"
            className={({ isActive }) => (isActive ? 'active nav-button' : 'nav-button')}
          >
            Architecture
          </NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Chatbot />} />
          <Route path="/architecture" element={<ArchitectureDiagram />} />
        </Routes>
      </main>

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
