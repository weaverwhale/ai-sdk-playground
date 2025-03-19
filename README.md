# AI SDK Chatbot with Tools

A simple chatbot application built with React and the AI SDK that demonstrates using tools to get location information, weather data, and the current time.

## Features

- Real-time chat interface
- Multiple tool calls in sequence
- Mock tools for getting:
  - User location
  - Weather information
  - Current time

## Technologies Used

- React
- AI SDK
- Express
- TypeScript
- Vite

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: Node.js 22)
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
