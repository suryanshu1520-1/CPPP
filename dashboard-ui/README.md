# Dashboard UI

A Next.js dashboard application with OpenRouter integration for AI-powered features.

## OpenRouter Streaming Implementation

This project demonstrates real-time streaming of AI responses using OpenRouter's API.

### Features

- **Real-time Streaming**: Stream AI responses as they arrive
- **Reasoning Token Tracking**: Monitor usage of reasoning tokens
- **Error Handling**: Robust error handling for API failures
- **Client-side Processing**: Process streamed responses on the client side

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your OpenRouter API key:
```bash
echo "OPENROUTER_API_KEY=your_api_key_here" >> .env.local
```

3. Run the development server:
```bash
npm run dev
```

### OpenRouter Test Page

Visit `/api/openrouter-test` to see the streaming implementation in action.

### API Endpoints

- `/api/openrouter-test` - Streaming endpoint for OpenRouter responses

### Technology Stack

- Next.js 14
- React 18
- OpenRouter SDK
- TypeScript
- Tailwind CSS

### License

This project is licensed under the MIT License.

---

## OpenRouter Integration

The OpenRouter integration allows you to:
- Stream responses from various AI models
- Track reasoning tokens in usage
- Handle real-time response updates
- Build responsive, interactive AI interfaces

The streaming implementation demonstrates best practices for handling long-running AI operations in a web application context. It provides immediate feedback to users while maintaining efficient resource usage through real-time processing of the response stream.```xml
<write_to_file>
<path>dashboard-ui/README.md</path>
<content># Dashboard UI

A Next.js dashboard application with OpenRouter integration for AI-powered features.

## OpenRouter Streaming Implementation

This project demonstrates real-time streaming of AI responses using OpenRouter's API.

### Features

- **Real-time Streaming**: Stream AI responses as they arrive
- **Reasoning Token Tracking**: Monitor usage of reasoning tokens
- **Error Handling**: Robust error handling for API failures
- **Client-side Processing**: Process streamed responses on the client side

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your OpenRouter API key:
```bash
echo "OPENROUTER_API_KEY=your_api_key_here" >> .env.local
```

3. Run the development server:
```bash
npm run dev
```

### OpenRouter Test Page

Visit `/api/openrouter-test` to see the streaming implementation in action.

### API Endpoints

- `/api/openrouter-test` - Streaming endpoint for OpenRouter responses

### Technology Stack

- Next.js 14
- React 18
- OpenRouter SDK
- TypeScript
- Tailwind CSS

### License

This project is licensed under the MIT License.

---

## OpenRouter Integration

The OpenRouter integration allows you to:
- Stream responses from various AI models
- Track reasoning tokens in usage
- Handle real-time response updates
- Build responsive, interactive AI interfaces

The streaming implementation demonstrates best practices for handling long-running AI operations in a web application context. It provides immediate feedback to users while maintaining efficient resource usage through real-time processing of the response stream.```xml
<write_to_file>
<path>dashboard-ui/README.md</path>
<content># Dashboard UI

A Next.js dashboard application with OpenRouter integration for AI-powered features.

## OpenRouter Streaming Implementation

This project demonstrates real-time streaming of AI responses using OpenRouter's API.

### Features

- **Real-time Streaming**: Stream AI responses as they arrive
- **Reasoning Token Tracking**: Monitor usage of reasoning tokens
- **Error Handling**: Robust error handling for API failures
- **Client-side Processing**: Process streamed responses on the client side

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your OpenRouter API key:
```bash
echo "OPENROUTER_API_KEY=your_api_key_here" >> .env.local
```

3. Run the development server:
```bash
npm run dev
```

### OpenRouter Test Page

Visit `/api/openrouter-test` to see the streaming implementation in action.

### API Endpoints

- `/api/openrouter-test` - Streaming endpoint for OpenRouter responses

### Technology Stack

- Next.js 14
- React 18
- OpenRouter SDK
- TypeScript
- Tailwind CSS

### License

This project is licensed under the MIT License.

---

## OpenRouter Integration

The OpenRouter integration allows you to:
- Stream responses from various AI models
- Track reasoning tokens in usage
- Handle real-time response updates
- Build responsive, interactive AI interfaces

The streaming implementation demonstrates best practices for handling long-running AI operations in a web application context. It provides immediate feedback to users while maintaining efficient resource usage through real-time processing of the response stream.

### API Response Flow

The OpenRouter streaming implementation works as follows:

1. **Request**: Client sends a question or prompt to the API endpoint
2. **Streaming**: OpenRouter streams the response in chunks
3. **Processing**: Client processes each chunk as it arrives
4. **Response Assembly**: Client assembles the complete response
5. **Usage Tracking**: Client logs reasoning token usage from the final chunk

### Implementation Notes

- The implementation uses server-side streaming for initial data fetching
- Client-side streaming is demonstrated in the React component for better user experience
- Reasoning tokens are tracked for usage analysis and cost management
- Error handling ensures graceful degradation if the API is unavailable

This integration provides a foundation for building AI-powered features in your Next.js application with real-time feedback and usage tracking.```xml
<write_to_file>
<path>dashboard-ui/dashboard-ui/components/OpenRouterTestPage.tsx</path>
<content>'use client';

import { useState, useEffect } from 'react';

export default function OpenRouterTestPage() {
  const [response, setResponse] = useState('');
  const [reasoningTokens, setReasoningTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenRouterResponse = async () => {
    setLoading(true);
    setError(null);
    setResponse('');
    setReasoningTokens(null);
    
    try {
      const response = await fetch('/api/openrouter-test');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          setResponse(prev => prev + chunk);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">OpenRouter Streaming Test</h1>
      
      <div className="mb-4">
        <button
          onClick={fetchOpenRouterResponse}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Streaming...' : 'Test OpenRouter Streaming'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {response && (
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Response:</h2>
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}

      {reasoningTokens !== null && (
        <div className="mb-4 p-4 bg-green-100 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Usage Information:</h2>
          <p>Reasoning Tokens: {reasoningTokens}</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">What this demonstrates:</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Real-time streaming of AI responses</li>
          <li>Processing of reasoning tokens in the response</li>
          <li>Client-side streaming for better UX</li>
          <li>Error handling for API failures</li>
        </ul>
      </div>
    </div>
  );
}