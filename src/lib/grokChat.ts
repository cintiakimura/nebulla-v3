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
  const apiKey = (typeof process !== 'undefined' && process.env.GROK_API_KEY) || '';
  
  if (!apiKey) {
    console.error('GROK_API_KEY is not set');
    return 'Error: GROK_API_KEY is not set';
  }

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.1',
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to call Grok API');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling Grok:', error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Mocking the GoogleGenAI interface to redirect calls to Grok 4.1
 * This is required because the frontend imports GoogleGenAI from @google/genai
 */
export class GoogleGenAI {
  constructor(config: { apiKey: string }) {}

  get models() {
    return {
      generateContent: async (params: any) => {
        const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
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
          }
        };
      }
    };
  }
}
