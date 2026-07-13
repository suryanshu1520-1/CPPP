'use client';

import { useState } from 'react';

export default function OpenRouterTestPage() {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchResponse = async () => {
    setLoading(true);
    setError(null);
    setResponse('');

    try {
      const res = await fetch('/api/openrouter-test');

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
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
    <div style={{ maxWidth: '860px', margin: '48px auto', padding: '0 24px', fontFamily: 'var(--font-sans, system-ui)' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '8px' }}>
        OpenRouter Streaming Test
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '32px', fontSize: '0.95rem' }}>
        Tests real-time streaming from OpenRouter via the <code>/api/openrouter-test</code> endpoint.
      </p>

      <button
        onClick={fetchResponse}
        disabled={loading}
        style={{
          padding: '10px 24px',
          background: loading ? '#9ca3af' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.95rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '24px',
          transition: 'background 0.2s',
        }}
      >
        {loading ? '⏳ Streaming...' : '▶ Test OpenRouter Streaming'}
      </button>

      {error && (
        <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', marginBottom: '16px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div style={{ padding: '20px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>Response:</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#374151', margin: 0 }}>{response}</p>
        </div>
      )}

      <div style={{ padding: '20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', marginTop: '24px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '10px', color: '#1e40af' }}>What this demonstrates:</h2>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8', color: '#1d4ed8' }}>
          <li>Real-time streaming of AI responses via OpenRouter</li>
          <li>Server-side route using OpenAI-compatible client</li>
          <li>Client-side <code>ReadableStream</code> consumption</li>
          <li>Graceful error handling for API failures</li>
        </ul>
      </div>
    </div>
  );
}
