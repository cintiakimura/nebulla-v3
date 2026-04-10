import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { VoiceLinesIcon } from './VoiceLinesIcon';

let nextPlayTime = 0;

function playPcmChunk(base64Data: string, audioCtx: AudioContext, isSoundOn: boolean) {
  if (!isSoundOn) return;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  const buffer = audioCtx.createBuffer(1, float32Array.length, 24000);
  buffer.getChannelData(0).set(float32Array);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  
  const currentTime = audioCtx.currentTime;
  if (nextPlayTime < currentTime) {
    nextPlayTime = currentTime + 0.05;
  }
  source.start(nextPlayTime);
  nextPlayTime += buffer.duration;
}

export function AssistantSidebar({ width = 320, onActionRequiresPayment }: { width?: number, onActionRequiresPayment?: (action: string) => void }) {
  const [isLive, setIsLive] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const isSoundOnRef = useRef(isSoundOn);
  useEffect(() => { isSoundOnRef.current = isSoundOn; }, [isSoundOn]);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'model', text: 'System initialized. Ready to collaborate.' }
  ]);
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
      // Connect to Grok 4.1 via Backend Proxy to keep API Key secure
      const response = await fetch('/api/grok/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ 
            role: 'system', 
            content: "You are Nebula, an expert AI dev partner. Help the user build their application, write code, and design systems. Be concise and helpful." 
          }, { 
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
      const responseText = data.choices?.[0]?.message?.content || '';
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
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
              <div className="text-13 no-bold prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
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
