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
 * Simple GROK client
 */
export async function sendToGROK(message: string): Promise<string> {
  try {
    // Connect to GROK 4.1 via Backend Proxy
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
      throw new Error(`GROK API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling GROK:', error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
