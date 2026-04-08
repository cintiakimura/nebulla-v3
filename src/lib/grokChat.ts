export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export enum Modality {
  MODALITY_UNSPECIFIED = "MODALITY_UNSPECIFIED",
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
}

/**
 * Simple Grok client
 */
export async function sendToGrok(message: string): Promise<string> {
  try {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error('GROK_API_KEY is not set in environment variables.');
    }

    // Connect to Grok 4.1 via Backend Proxy
    const response = await fetch('/api/grok/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling Grok:', error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Mocking the AI interface to redirect calls to Grok 4.1
 * This is required because the frontend imports from the AI SDK
 */
/*
export class GoogleGenAI {
  constructor(config: { apiKey: string }) {}

  get models() {
    return {
      generateContent: async (params: any) => {
        let prompt = '';
        if (typeof params.contents === 'string') {
          prompt = params.contents;
        } else if (Array.isArray(params.contents)) {
          // Extract text from the last user message
          const lastContent = params.contents[params.contents.length - 1];
          if (lastContent.parts && Array.isArray(lastContent.parts)) {
            prompt = lastContent.parts.map((p: any) => p.text || '').join(' ');
          }
        } else if (params.contents && typeof params.contents === 'object') {
          if (params.contents.parts && Array.isArray(params.contents.parts)) {
            prompt = params.contents.parts.map((p: any) => p.text || '').join(' ');
          }
        }

        if (!prompt) {
          prompt = JSON.stringify(params.contents);
        }

        const response = await sendToGrok(prompt);
        return {
          text: response,
          candidates: [{ content: { parts: [{ text: response }] } }]
        };
      }
    };
  }

  get chats() {
    return {
      create: (config: any) => {
        return {
          sendMessage: async (params: { message: string }) => {
            const response = await sendToGrok(params.message);
            return {
              text: response,
              candidates: [{ content: { parts: [{ text: response }] } }]
            };
          },
          sendMessageStream: async (params: { message: string }) => {
            const response = await sendToGrok(params.message);
            return (async function* () {
              yield {
                text: response,
                candidates: [{ content: { parts: [{ text: response }] } }]
              };
            })();
          }
        };
      }
    };
  }

  get live() {
    return {
      connect: (params: any) => {
        console.log("Mocking Live API connection...");
        if (params.callbacks?.onopen) {
          setTimeout(() => params.callbacks.onopen(), 100);
        }
        return Promise.resolve({
          sendRealtimeInput: (input: any) => {
            console.log("Mock Live Input:", input);
          },
          close: () => {
            console.log("Mock Live Closed");
            if (params.callbacks?.onclose) params.callbacks.onclose();
          }
        });
      }
    };
  }
}
*/
