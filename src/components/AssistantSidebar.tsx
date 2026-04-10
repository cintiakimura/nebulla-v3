import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { VoiceLinesIcon } from './VoiceLinesIcon';

let nextPlayTime = 0;

// Streaming TTS Player using WebSocket and MediaSource
class StreamingTTSPlayer {
  private socket: WebSocket | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audio: HTMLAudioElement | null = null;
  private queue: Uint8Array[] = [];
  private dormantTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {}

  private initAudio() {
    if (this.isInitialized) return;
    
    console.log("[TTS] Initializing audio elements...");
    this.audio = new Audio();
    this.mediaSource = new MediaSource();
    
    this.mediaSource.addEventListener('sourceopen', () => {
      console.log("[TTS] MediaSource opened");
      if (this.mediaSource && !this.sourceBuffer) {
        try {
          this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
          this.sourceBuffer.addEventListener('updateend', () => {
            this.processQueue();
          });
          console.log("[TTS] SourceBuffer added successfully");
        } catch (e) {
          console.error("[TTS] Failed to add SourceBuffer:", e);
        }
      }
    });
    
    this.audio.src = URL.createObjectURL(this.mediaSource);
    this.isInitialized = true;
  }

  private processQueue() {
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.queue.length === 0) return;
    const chunk = this.queue.shift();
    if (chunk) {
      try {
        this.sourceBuffer.appendBuffer(chunk);
      } catch (e) {
        console.error("[TTS] Error appending buffer:", e);
      }
    }
  }

  async connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      if (this.dormantTimer) {
        clearTimeout(this.dormantTimer);
        this.dormantTimer = null;
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.socket = new WebSocket(`${protocol}//${host}/ws/tts`);

    this.socket.onmessage = async (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : await event.data.text();
        const data = JSON.parse(text);
        
        if (data.type === 'audio.delta' && data.audio) {
          const binary = atob(data.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          
          this.queue.push(bytes);
          this.processQueue();
          
          if (this.audio && this.audio.paused) {
            this.audio.play().catch(err => {
              if (err.name !== 'NotAllowedError') {
                console.error("[TTS] Playback error:", err);
              }
            });
          }
        } else if (data.type === 'audio.done') {
          console.log("[TTS] Audio stream finished");
          this.dormantTimer = setTimeout(() => {
            console.log("[TTS] Connection is now dormant");
          }, 3000);
        }
      } catch (e) {
        console.error("[TTS] Error processing WebSocket message:", e);
      }
    };

    this.socket.onopen = () => console.log("[TTS] WebSocket connected");
    this.socket.onclose = () => console.log("[TTS] WebSocket closed");
    this.socket.onerror = (err) => console.error("[TTS] WebSocket error", err);

    return new Promise((resolve) => {
      if (this.socket) {
        const onOpen = () => {
          this.socket?.removeEventListener('open', onOpen);
          resolve(true);
        };
        this.socket.addEventListener('open', onOpen);
      }
    });
  }

  speak(text: string) {
    this.initAudio();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.connect().then(() => this.sendText(text));
    } else {
      this.sendText(text);
    }
  }

  private sendText(text: string) {
    if (this.dormantTimer) {
      clearTimeout(this.dormantTimer);
      this.dormantTimer = null;
    }
    
    console.log("[TTS] Sending text to stream:", text.substring(0, 30) + "...");
    this.socket?.send(JSON.stringify({ type: 'text.delta', text }));
    this.socket?.send(JSON.stringify({ type: 'text.done' }));
  }
}

const ttsPlayer = new StreamingTTSPlayer();

export function AssistantSidebar({ width = 320, onActionRequiresPayment }: { width?: number, onActionRequiresPayment?: (action: string) => void }) {
  const [isLive, setIsLive] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const isSoundOnRef = useRef(isSoundOn);
  useEffect(() => { isSoundOnRef.current = isSoundOn; }, [isSoundOn]);
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
      
      const systemPrompt = `You are Nebula, an expert AI dev partner. You operate under strict rules:

MODEL RULES:
- Normal conversation and reasoning: grok-4-1-fast-reasoning
- Coding tasks: grok-code-fast-1

GROK A BEHAVIOR (Conversation):
1. Always listen to the user and summarize what you understood.
2. Scan the current Master Plan (provided below) to check for conflicts or inconsistencies.
3. If there is any potential problem (security, architecture, breaking changes, etc.), clearly warn the user.
4. Ask: "If I understood correctly, you want to [summary]. Are you sure you want to lock this in?"
5. Only when the user says "yes" or "yes, lock it in", output the correct invisible tag at the very end of your response: <START_MASTERPLAN> or <START_CODING>.

GROK B BEHAVIOR (Silent):
- When updating the Master Plan, wrap the new content in <START_MASTERPLAN> and <END_MASTERPLAN>.
- Grok B must never speak to the user directly.

CODING MODE:
- When <START_CODING> is triggered, provide reasoning wrapped in <REASONING> tags.
- Reasoning should show: what files are being edited, what was fixed, and why it wasn't working.
- When coding is finished, clearly summarize what was changed.

CURRENT MASTER PLAN:
${JSON.stringify(latestMP, null, 2)}`;

      // Connect to Grok via Backend Proxy
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
        throw new Error(errorData.error || `Grok API Error: ${response.status}`);
      }

      const data = await response.json();
      const fullResponse = data.choices?.[0]?.message?.content || '';
      
      // Extract reasoning if present
      const reasoningMatch = fullResponse.match(/<REASONING>([\s\S]*?)<\/REASONING>/);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;
      
      // Strip ALL tags for display and TTS
      const cleanText = fullResponse
        .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, '')
        .replace(/<START_MASTERPLAN>[\s\S]*?<END_MASTERPLAN>/g, '')
        .replace(/<START_CODING>/g, '')
        .trim();

      setMessages(prev => [...prev, { role: 'model', text: cleanText, fullText: fullResponse, reasoning }]);

      // Streaming TTS with AGENT_GROK_VOICE
      if (isSoundOnRef.current && cleanText) {
        ttsPlayer.speak(cleanText);
      }
    } catch (error: any) {
      console.error("Grok API Error:", error);
      setMessages(prev => [...prev, { role: 'system', text: `Error: ${error.message || 'Failed to connect to Grok.'}` }]);
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
            <button 
              onClick={() => setIsSoundOn(!isSoundOn)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all hover:bg-white/5 ${!isSoundOn ? 'text-red-400' : 'text-slate-500 hover:text-cyan-300'}`}
              title={isSoundOn ? "Mute Sound" : "Unmute Sound"}
            >
              <span className="material-symbols-outlined text-18">{isSoundOn ? 'volume_up' : 'volume_off'}</span>
            </button>
          </div>
          <button 
            onClick={() => onActionRequiresPayment?.('Upload')}
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
