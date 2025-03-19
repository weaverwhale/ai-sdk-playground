import './App.css'
import Chatbot from './components/Chatbot'

function App() {
  return (
    <div className="app-container">
      <h1>AI SDK</h1>
      <Chatbot />
      <footer>
        <p>Built with React, AI SDK, and Vite</p>
        <div className="footer-links">
          <a href="https://sdk.vercel.ai/docs" target="_blank" rel="noopener noreferrer">AI SDK Docs</a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">React</a>
          <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer">Vite</a>
        </div>
      </footer>
    </div>
  )
}

export default App
