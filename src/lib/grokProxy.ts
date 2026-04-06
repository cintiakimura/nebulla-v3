
import { Type, Modality } from '@google/genai';

/**
 * GrokProxy: A drop-in replacement for the Google Gemini SDK (@google/genai).
 * This proxy redirects all chat and content generation calls to Grok 4.1.
 */
export class GoogleGenAI {
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    // Priority given to GROK_API_KEY from environment
    this.apiKey = process.env.GROK_API_KEY || config.apiKey;
  }

  /**
   * Mocking the chats interface
   */
  get chats() {
    return {
      create: (config: any) => {
        return {
          sendMessage: async (params: { message: string }) => {
            const response = await this.callGrok(params.message);
            return {
              text: response,
              candidates: [{ content: { parts: [{ text: response }] } }]
            };
          },
          sendMessageStream: async (params: { message: string }) => {
            return this.callGrokStream(params.message);
          }
        };
      }
    };
  }

  /**
   * Mocking the models interface
   */
  get models() {
    return {
      generateContent: async (params: any) => {
        const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
        const response = await this.callGrok(prompt);
        return {
          text: response,
          candidates: [{ content: { parts: [{ text: response }] } }]
        };
      },
      generateContentStream: async (params: any) => {
        const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
        return this.callGrokStream(prompt);
      }
    };
  }

  /**
   * Mocking the Live API (Grok 4.1 fallback)
   */
  get live() {
    return {
      connect: () => {
        console.warn("Grok 4.1 does not support Live API yet. Falling back to mock.");
        return Promise.resolve({
          sendRealtimeInput: () => {},
          close: () => {}
        });
      }
    };
  }

  /**
   * Internal helper to call Grok 4.1 Chat Completions API
   */
  private async callGrok(prompt: string): Promise<string> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.1',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Internal helper to call Grok 4.1 Streaming API
   */
  private async *callGrokStream(prompt: string) {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.1',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API Error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '');
            if (jsonStr === '[DONE]') break;
            try {
              const json = JSON.parse(jsonStr);
              const content = json.choices?.[0]?.delta?.content || '';
              yield { text: content };
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    }
  }
}

export { Type, Modality };
