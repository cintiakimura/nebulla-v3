/**
 * GROK Service for Nebulla
 * Handles communication with GROK 4.1 (The unified reasoning model)
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send a message to GROK 4.1
 */
export async function sendToGROK(messages: ChatMessage[]): Promise<string> {
  try {
    const response = await fetch('/api/grok/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'grok-4-1-fast-reasoning'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to call GROK 4.1 API');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling GROK 4.1:', error);
    throw error;
  }
}
