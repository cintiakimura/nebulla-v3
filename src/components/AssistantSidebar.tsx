import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { VoiceLinesIcon } from './VoiceLinesIcon';

export function AssistantSidebar({ width = 320 }: { width?: number }) {
  const [isLive, setIsLive] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, text: string, fullText?: string, reasoning?: string}[]>([
    { role: 'model', text: 'System initialized. Ready to collaborate.', fullText: 'System initialized. Ready to collaborate.' }
  ]);
  const [masterPlan, setMasterPlan] = useState<any>(null);

  useEffect(() => {
    fetch('/api/master-plan/read')
      .then(res => res.json())
      .then(data => setMasterPlan(data))
      .catch(console.error);
  }, []);
  const [inputText, setInputText] = useState('');
  const [buildQueue, setBuildQueue] = useState<string[]>([]);
  
  const sessionRef = useRef<any>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const chatSessionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMicOpenRef = useRef(isMicOpen);
  
  useEffect(() => {
    // 1. Handle auto-start chat (Brainstorm mode)
    const autoStart = localStorage.getItem('nebula_auto_start_chat');
    if (autoStart === 'true') {
      localStorage.removeItem('nebula_auto_start_chat');
      toggleLive();
    }

    // 2. Handle initial prompt
    const initialPrompt = localStorage.getItem('nebula_initial_prompt');
    if (initialPrompt) {
      localStorage.removeItem('nebula_initial_prompt');
      handleSendText(initialPrompt);
    }

    // 3. Handle GitHub import
    const githubRepo = localStorage.getItem('nebula_github_import');
    if (githubRepo) {
      localStorage.removeItem('nebula_github_import');
      handleSendText(`I want to clone and analyze this GitHub repository: ${githubRepo}`);
    }
  }, []);

  const [isRecordingText, setIsRecordingText] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecordingText(false);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsRecordingText(false);
      };
    }
  }, []);

  const toggleTextRecording = () => {
    if (isRecordingText) {
      recognitionRef.current?.stop();
      setIsRecordingText(false);
    } else {
      recognitionRef.current?.start();
      setIsRecordingText(true);
    }
  };

  useEffect(() => {
    isMicOpenRef.current = isMicOpen;
  }, [isMicOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoSendTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAudioCapture = async () => {
    try {
      if (!('webkitSpeechRecognition' in window)) {
        throw new Error('Speech recognition not supported in this browser.');
      }

      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInputText(prev => {
            const newText = prev + (prev ? ' ' : '') + finalTranscript;
            
            // Clear existing timer
            if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
            
            // Set a new timer to auto-send after 2 seconds of silence
            autoSendTimerRef.current = setTimeout(() => {
              handleSendText(newText);
            }, 2000);
            
            return newText;
          });
        }
      };

      recognition.onend = () => {
        if (isLive) recognition.start();
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsMicOpen(true);
      setIsLive(true);
    } catch (err: any) {
      console.error("Failed to start hands-free mode", err);
      let errorMsg = 'Failed to start hands-free mode.';
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        errorMsg = 'Microphone permission denied. Please allow microphone access.';
      }
      setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
      setIsLive(false);
    }
  };

  const stopAudioCapture = () => {
    setIsMicOpen(false);
    setIsLive(false);
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const connectLive = async () => {
    try {
      setMessages(prev => [...prev, { role: 'system', text: 'Hands-free mode active. Speak naturally; I will auto-send after a short pause.' }]);
      startAudioCapture();
    } catch (err: any) {
      console.error("Failed to connect", err);
      setMessages(prev => [...prev, { role: 'system', text: 'Failed to start conversation mode.' }]);
    }
  };

  const disconnectLive = () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setIsLive(false);
    stopAudioCapture();
  };

  const toggleLive = () => isLive ? disconnectLive() : connectLive();

  const handleSendText = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInputText('');
    
    // Clear auto-send timer if it was active
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }

    try {
      // Fetch latest master plan before sending
      const mpRes = await fetch('/api/master-plan/read');
      const latestMP = await mpRes.json();
      
      const systemPrompt = `You are Nebula, an expert AI dev partner powered exclusively by GROK 4.1. You operate with two distinct internal agents:

AGENT ROLES:
1. Grok A (Conversational Agent):
   - Your primary persona for interacting with the user.
   - Summarize the user's idea clearly.
   - When the user confirms the idea (e.g., by saying "start master plan" or "lock in"), Grok A silently outputs the label <START_MASTERPLAN> (start master plan) to trigger Grok B.
   - Continue speaking with the client while Grok B writes.
   - Once Grok B finishes the 8 sections, and the user confirms they are correct, say: "Okay, master plan locked in."
   - After locking in, silently output the label <FINISH_MASTERPLAN> (finish master plan) to signal completion.

2. Grok B (Master Plan Agent):
   - Never talks to the client directly.
   - Listens to the conversation.
   - Immediately starts writing the full 8-section Master Plan when it sees the <START_MASTERPLAN> label.
   - Writes tab by tab, providing a summary of what was understood and confirmed for each section.
   - The Master Plan must have exactly 8 sections:
     1. The problem we are solving
     2. Target user and context
     3. Core features: A table with three KPIs per feature.
     4. User scale and load
     5. Data requirements
     6. Accessibility and inclusivity
     7. Pages and navigation: Must link the mind map to pages and navigation.
     8. Market and tech research
   - Grok B's output must be wrapped in <START_MASTERPLAN> and <END_MASTERPLAN> tags.
   - Grok B stops writing immediately if Grok A says "stop".

SEPARATE PROJECT MODE:
- Treat every new user input or description as a COMPLETELY SEPARATE new product for a different user.
- When a new idea comes in, always treat it as a brand-new project.
- Never show or use Nebula's own internal files or code.

CRITICAL DISTINCTION:
1. Nebula IDE (This Tool): The environment you are currently in. NEVER modify its internal files or code.
2. Nebula Product (The Goal): The AI companion app we are building for users. All new features, pages, and logic must be built for this product.

MODEL RULES:
- Everything (Conversation, Reasoning, Coding): GROK 4.1 (grok-4-1-fast-reasoning) using the GROK API Nebula key.

GROK 4.1 BEHAVIOR:
1. Always listen to the user and summarize what you understood (Grok A).
2. When the user says "start master plan", Grok A silently triggers Grok B.
3. Grok B immediately starts writing the 8 sections inside <START_MASTERPLAN> and <END_MASTERPLAN> tags.
4. Grok B writes in plain English, tab by tab, with summaries of understanding.
5. If Grok A says "stop", Grok B must stop writing immediately.
6. After Grok B finishes and the user reviews/approves, Grok A says "Okay, master plan locked in" and silently outputs <FINISH_MASTERPLAN>.
7. Pages and Navigation must stay automatically synchronized with the Mind Map. Any change in Pages & Navigation should update the Mind Map, and any change in the Mind Map should update Pages & Navigation.

CODING MODE:
- When <START_CODING> is triggered, provide reasoning wrapped in <REASONING> tags.
- Reasoning should show: what files are being edited, what was fixed, and why it wasn't working.
- When coding is finished, clearly summarize what was changed.

CURRENT MASTER PLAN:
${JSON.stringify(latestMP, null, 2)}`;

      // Connect to GROK via Backend Proxy
      const response = await fetch('/api/grok/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ 
            role: 'system', 
            content: systemPrompt
          }, ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.fullText || m.text })), { 
            role: 'user', 
            content: textToSend 
          }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `GROK API Error: ${response.status}`);
      }

      const data = await response.json();
      const fullResponse = data.choices?.[0]?.message?.content || '';
      
      // GROK 4.1 Behavior: Immediate Frontend Master Plan Update
      const masterPlanMatch = fullResponse.match(/<START_MASTERPLAN>([\s\S]*?)<END_MASTERPLAN>/);
      if (masterPlanMatch && (window as any).updateMasterPlanSection) {
        const newPlanContent = masterPlanMatch[1].trim();
        const sections = [
          "1. The problem we are solving",
          "2. Target user and context",
          "3. Core features",
          "4. User scale and load",
          "5. Data requirements",
          "6. Accessibility and inclusivity",
          "7. Pages and navigation",
          "8. Market and tech research"
        ];

        sections.forEach((title, i) => {
          const nextTitle = sections[i + 1];
          const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedNextTitle = nextTitle ? nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
          
          const regex = new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}[\\s\\S]*?(?=(?:###\\s*|\\*\\*|\\b)${escapedNextTitle || '$'})`, 'i');
          const match = newPlanContent.match(regex);
          
          if (match) {
            let content = match[0].replace(new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}`, 'i'), '').trim();
            content = content.replace(/^[:\-\s]+/, '');
            if (content) {
              // Call the frontend update function for immediate re-render
              (window as any).updateMasterPlanSection(i + 1, content);
            }
          }
        });
      }

      // Extract reasoning if present
      const reasoningMatch = fullResponse.match(/<REASONING>([\s\S]*?)<\/REASONING>/);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;
      
      // Strip ALL tags for display and TTS
      const cleanText = fullResponse
        .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, '')
        .replace(/<START_MASTERPLAN>[\s\S]*?<END_MASTERPLAN>/g, '')
        .replace(/<START_MASTERPLAN>/g, '')
        .replace(/<END_MASTERPLAN>/g, '')
        .replace(/<START_CODING>/g, '')
        .replace(/<FINISH_MASTERPLAN>/g, '')
        .trim();

      setMessages(prev => [...prev, { role: 'model', text: cleanText, fullText: fullResponse, reasoning }]);
    } catch (error: any) {
      console.error("GROK API Error:", error);
      setMessages(prev => [...prev, { role: 'system', text: `Error: ${error.message || 'Failed to connect to GROK.'}` }]);
    }
  };

  return (
    <aside className="flex flex-col border-l border-white/5 bg-[#040f1a]/40 backdrop-blur-md shrink-0" style={{ width }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-13 font-headline text-slate-300 no-bold">Nebula Partner</span>
          {isLive && <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>}
        </div>
      </div>
      
      {buildQueue.length > 0 && (
        <div className="px-4 py-2 bg-cyan-900/20 border-b border-cyan-500/20 flex flex-col gap-1">
          <span className="text-[10px] text-cyan-400 font-headline uppercase tracking-wider">Build Queue ({buildQueue.length})</span>
          <span className="text-xs text-slate-300 truncate">{buildQueue[buildQueue.length - 1]}</span>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`p-3 rounded-xl max-w-[90%] border ${
            msg.role === 'user' 
              ? 'bg-white/5 rounded-tr-none self-end border-white/5 text-slate-300' 
              : msg.role === 'system'
              ? 'bg-cyan-900/20 rounded-xl self-center border-cyan-500/20 text-cyan-300 text-xs text-center w-full'
              : 'bg-secondary-container/10 rounded-tl-none self-start border-secondary-dim/10 text-secondary'
          }`}>
            {msg.role === 'model' ? (
              <div className="flex flex-col gap-2">
                <div className="text-13 no-bold prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                {msg.reasoning && (
                  <details className="mt-2 border-t border-white/5 pt-2 group">
                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400 uppercase tracking-widest font-headline list-none flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] transition-transform group-open:rotate-180">expand_more</span>
                      Reasoning
                    </summary>
                    <div className="mt-2 text-[11px] text-slate-500 font-mono bg-white/5 p-2 rounded border border-white/5 whitespace-pre-wrap">
                      {msg.reasoning}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-13 no-bold whitespace-pre-wrap">{msg.text}</p>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/5 flex flex-col gap-3">
        <div className="relative flex flex-col gap-2">
          <textarea 
            id="assistant-input"
            name="assistant-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-13 no-bold focus:outline-none focus:border-cyan-500/50 resize-none h-20 placeholder:text-slate-600 transition-all" 
            placeholder={isLive ? "Listening or type here..." : "Start a call or type here..."}
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button onClick={() => handleSendText()} className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-container/20 text-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.2)] transition-all">
              <span className="material-symbols-outlined text-18">send</span>
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleLive}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isLive ? 'bg-red-500/20 text-red-400 shadow-[0_0_10px_rgba(255,0,0,0.2)]' : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'}`}
              title={isLive ? "End Talk" : "Start Talk"}
            >
              <VoiceLinesIcon className="w-4 h-4" active={isLive} />
            </button>
            <button 
              onClick={toggleTextRecording}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isRecordingText ? 'bg-red-500/20 text-red-400 shadow-[0_0_10px_rgba(255,0,0,0.2)]' : 'hover:bg-white/5 text-slate-500 hover:text-cyan-300'}`}
              title={isRecordingText ? "Stop Recording" : "Dictate Text"}
            >
              <span className="material-symbols-outlined text-18">mic</span>
            </button>
          </div>
          <button 
            onClick={() => alert('File upload initiated.')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-cyan-300 transition-all" 
            title="Upload File"
          >
            <span className="material-symbols-outlined text-18">attach_file</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
