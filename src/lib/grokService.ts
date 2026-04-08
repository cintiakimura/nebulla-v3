/**
 * Grok Service for Nebulla
 * Handles communication with Grok A (Interviewer) and Grok B (Master Plan Updater)
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send a message to Grok A (The Interviewer)
 */
export async function sendToGrokA(messages: ChatMessage[]): Promise<string> {
  try {
    const response = await fetch('/api/grok/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'grok-4-1-fast-reasoning' // Grok A
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to call Grok A API');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling Grok A:', error);
    throw error;
  }
}

/**
 * Send a message to Grok B (The Silent Master Plan Updater)
 * This agent only sees the conversation and updates the master plan.
 */
export async function triggerGrokB(conversation: ChatMessage[]): Promise<void> {
  try {
    const response = await fetch('/api/grok/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are Grok B, a silent architect. Your only job is to analyze the conversation and update the Master Plan. 
            The Master Plan has 9 sections:
            1. The Problem We’re Solving
            2. Target User & Context
            3. Must-Have Features
            4. Nice-to-Have Features
            5. User Scale & Load
            6. Data Requirements
            7. Accessibility & Inclusivity
            8. Pages & Navigation
            9. Market & Tech Research

            When you identify new information for any of these sections, you MUST output a JSON object in this format:
            { "updates": [{ "tabIndex": 1, "content": "Updated content for section 1" }, ...] }
            
            Do not say anything else. Just the JSON.`
          },
          ...conversation
        ],
        model: 'grok-4-1-fast-reasoning' // Grok B
      }),
    });

    if (!response.ok) {
      console.error('Failed to call Grok B API');
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from Grok B's response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const updates = JSON.parse(jsonMatch[0]).updates;
      if (Array.isArray(updates)) {
        for (const update of updates) {
          await fetch('/api/master-plan/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
          });
        }
      }
    }
  } catch (error) {
    console.error('Error in Grok B processing:', error);
  }
}
