# AI SDK Chatbot with Tools & Deep Search

A multi-tool chatbot built with React and the AI SDK.

## Features

- Real-time chat interface
  - Multiple tools available
  - Can call multiple tools per question
- Deep search mode
  - Search plan display
  - Search plan step display
  - Search plan summary display

## Technologies Used

- Vite
- TypeScript
- Express
- React
- AI SDK

## Getting Started

### Prerequisites

- Node.js 22 (provided via nvm)
- npm or yarn

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

This will start both the frontend and backend servers using concurrently.

- The React frontend will be available at: http://localhost:5173
- The Express API runs at: http://localhost:1753

## Usage

Once the application is running, you can interact with the chatbot by typing messages in the input field. Try asking:

- "What's my roas?"
- "Forecast my sales next month"

The chatbot will use the appropriate tools to respond to your queries.
