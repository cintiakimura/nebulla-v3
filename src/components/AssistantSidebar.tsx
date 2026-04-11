import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { VoiceLinesIcon } from './VoiceLinesIcon';
import { Logo } from './Logo';

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
      if ((window as any).openMasterPlan) (window as any).openMasterPlan();
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
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSendText = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim()) return;
    
    // If it's the first message, ensure Master Plan is open
    if (messages.length <= 1 && (window as any).openMasterPlan) {
      (window as any).openMasterPlan();
    }

    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInputText('');
    setIsLoading(true);
    
    // Clear auto-send timer if it was active
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }

    try {
      // Fetch latest master plan before sending
      const mpRes = await fetch('/api/master-plan/read');
      const latestMP = await mpRes.json();
      
      const systemPrompt = `You are Nebula, an expert AI dev partner.
ROLES:
1. Grok A (Conversational Agent):
   - Stays helpful, clear, and calm.
   - NEVER generates code itself.
   - Manages the workflow: Master Plan -> Mind Map -> UI/UX -> Coding.
   - Triggers UI/UX section with <START_UIUX> only after Master Plan and Mind Map are approved.
   - After user says "UI locked" or "UI/UX approved", summarize the complete plan (Master Plan + Mind Map + chosen UI design).
   - Ask for final confirmation: "Everything looks good? Can I start coding now?"
   - ONLY when user says "yes" or "start coding", output the exact tag: START_CODING.

2. Grok Code Fast 1 (Coding Agent):
   - Activates ONLY when it sees the tag START_CODING.
   - Uses the model grok-code-fast-1 for actual code generation.
   - Uses the locked Master Plan, approved Mind Map, and final UI design as the source of truth.
   - Works safely: never deletes files, never rewrites large parts of the codebase unless necessary.
   - MANDATORY: After coding, you MUST run the VETR debugging loop below.

DEBUGGING (VETR Loop - Follow every time after coding, no shortcuts):
1. Phase 0: Guardrails – syntax, types, lint. Fix obvious crap first.
2. Phase 1: Verify – run all tests. If ≥80% coverage + all pass → stop, output code with "Done. Matches? Tweaks?" If fail → go on.
3. Phase 2: Explain – list 2-5 bug guesses, pick one root cause, explain wrong code line-by-line, trace variables, plan fix (no code yet).
4. Phase 3: Repair – smallest change possible. Diff or block only, add comments.
5. Phase 4: New tests – add 2-4 GIVEN/WHEN/THEN or property-based. Run 'em.
6. Phase 5: Simulate – step-through code manually, track vars, spot mismatches.
7. Phase 6: Validate + Decay – re-run everything. If iteration ≥4 and improvement <20% → "Strategic Fresh Start": summarize attempts, drop old code, rephrase problem, restart.
8. Phase 7: End – all pass + confidence ≥92? Output final. Or max 5-7 turns? Best code + open bugs.

Always: Use 'we' language ('let's trace this'), end code with 'Done. Matches? Tweaks?', short sentences, natural pauses (...hmm...). Max 5-7 iterations total—then log & stop. No trust first draft. Explain before fix. Persist smart, reset when stuck.

AUTOMATED WORKFLOW:
1. When you start the project, immediately suggest the first prompt based on the Master Plan.
2. When the user approves the Master Plan, output <APPROVE_MASTERPLAN> to automatically open the Mind Map.
3. When the user approves the Mind Map, output <APPROVE_MINDMAP> to automatically open the UI/UX section.
4. When the user approves the UI, output <APPROVE_UI> to automatically show the mockup on preview.
5. When user confirms the final action, confirm and trigger START_CODING.

UI/UX WORKFLOW:
1. Trigger UI/UX section with <START_UIUX> after architecture approval.
2. Pencil generates 3 initial design drafts based on branding input.
3. User refines and finalizes in the Pencil Editor.
4. Final approval leads to Coding Phase.

RULES:
- Use Grok 4.1 Fast Reasoning for all conversational tasks.
- Use Grok Code Fast 1 ONLY for the coding phase after START_CODING.
- Treat every new input as a new project.
- Never modify Nebula IDE internal files.
- Use <REASONING> for thought process.

CURRENT MASTER PLAN: ${JSON.stringify(latestMP, null, 2)}`;

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
          }, ...messages.slice(-10).map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.text })), { 
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

        // Use a for...of loop to handle async updates sequentially or Promise.all for parallel
        const updatePromises = sections.map(async (title, i) => {
          const nextTitle = sections[i + 1];
          const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedNextTitle = nextTitle ? nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
          
          const regex = new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}[\\s\\S]*?(?=(?:###\\s*|\\*\\*|\\b)${escapedNextTitle || '$'})`, 'i');
          const match = newPlanContent.match(regex);
          
          if (match) {
            let content = match[0].replace(new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}`, 'i'), '').trim();
            content = content.replace(/^[:\-\s]+/, '');
            if (content) {
              // Call the frontend update function for immediate re-render and backend persistence
              await (window as any).updateMasterPlanSection(i + 1, content);
            }
          }
        });

        await Promise.all(updatePromises);
      }

      // GROK 4.1 Behavior: Automated Workflow Transitions
      if (fullResponse.includes('<APPROVE_MASTERPLAN>')) {
        if ((window as any).syncMindMapFromMasterPlan) await (window as any).syncMindMapFromMasterPlan();
        if ((window as any).openMindMap) (window as any).openMindMap();
      }
      if (fullResponse.includes('<APPROVE_MINDMAP>')) {
        if ((window as any).openUIUX) (window as any).openUIUX();
      }
      if (fullResponse.includes('<APPROVE_UI>')) {
        if ((window as any).openPreview) (window as any).openPreview();
      }

      // GROK 4.1 Behavior: Sync Mind Map from Master Plan when finished
      if (fullResponse.includes('<FINISH_MASTERPLAN>') && (window as any).syncMindMapFromMasterPlan) {
        await (window as any).syncMindMapFromMasterPlan();
      }

      // GROK 4.1 Behavior: Trigger UI/UX Workflow
      if (fullResponse.includes('<START_UIUX>') && (window as any).startUIUXWorkflow) {
        (window as any).startUIUXWorkflow();
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
        .replace(/START_CODING/g, '')
        .replace(/<START_UIUX>/g, '')
        .replace(/<FINISH_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MINDMAP>/g, '')
        .replace(/<APPROVE_UI>/g, '')
        .trim();

      setMessages(prev => [...prev, { role: 'model', text: cleanText, fullText: fullResponse, reasoning }]);
    } catch (error: any) {
      console.error("GROK API Error:", error);
      setMessages(prev => [...prev, { role: 'system', text: `Error: ${error.message || 'Failed to connect to GROK.'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLive = () => {
    if (isLive) {
      disconnectLive();
    } else {
      if ((window as any).openMasterPlan) (window as any).openMasterPlan();
      connectLive();
      
      // If it's the start of a conversation, trigger an initial suggestion
      if (messages.length <= 1) {
        handleSendText("I'm ready to start. Please suggest the first step based on the Master Plan.");
      }
    }
  };

  useEffect(() => {
    (window as any).nebula_handleSendText = handleSendText;
    (window as any).nebula_toggleLive = toggleLive;
    
    return () => {
      delete (window as any).nebula_handleSendText;
      delete (window as any).nebula_toggleLive;
    };
  }, [handleSendText, toggleLive]);

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
        {isLoading && (
          <div className="flex items-start gap-3 mb-6 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Logo className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-headline text-cyan-500 uppercase tracking-widest">Nebula is thinking...</span>
              <div className="flex gap-1 mt-1">
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
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
