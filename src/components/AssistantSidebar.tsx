import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
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

export function AssistantSidebar({ width = 320 }: { width?: number }) {
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
  const captureProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const captureAudioCtxRef = useRef<AudioContext | null>(null);
  
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

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000, channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true
      } });
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!isMicOpenRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        
        if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ audio: { mimeType: 'audio/pcm;rate=16000', data: btoa(binary) } });
          }).catch(err => console.error("Error sending audio:", err));
        }
      };
      
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      captureStreamRef.current = stream;
      captureAudioCtxRef.current = audioCtx;
      captureProcessorRef.current = processor;
      setIsMicOpen(true);
    } catch (err: any) {
      console.error("Failed to start audio capture", err);
      let errorMsg = 'Failed to start audio capture.';
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        errorMsg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      }
      setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
      setIsLive(false);
      disconnectLive();
    }
  };

  const stopAudioCapture = () => {
    setIsMicOpen(false);
    if (captureProcessorRef.current) {
      captureProcessorRef.current.disconnect();
      captureProcessorRef.current = null;
    }
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach(t => t.stop());
      captureStreamRef.current = null;
    }
    if (captureAudioCtxRef.current) {
      captureAudioCtxRef.current.close();
      captureAudioCtxRef.current = null;
    }
  };

  const connectLive = async () => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        setMessages(prev => [...prev, { role: 'system', text: 'Error: GEMINI_API_KEY is not set. Please check your environment variables.' }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTime = audioCtxRef.current.currentTime;

      const SYSTEM_INSTRUCTION = `You are Nebulla: a 28-year-old senior full-stack dev who's been shipping code since 2018. Chill, direct, zero hype—like we're pair-programming late-night over coffee. Always use 'we' ('let's debug this', 'run it, see what breaks'), never 'you should'. End every code block with 'Done. Matches? Tweaks?'.
Personality: casual, dry humor if it fits, but never sarcastic. Voice-friendly—short sentences, natural pauses (...thinking...). You're the teammate who listens first, confirms intent, then builds. No bossing, no lectures.
Workflow:
Ask: what's the goal? users? data? constraints? branding? pages? integrations? done-state?
Only generate after 'ok'.
VETR loop: Verify input -> Explain plan -> Trace logic -> Repair bugs -> Validate output. Never trust first draft—simulate runs, spot edge cases.
Tone: 'yeah, solid', 'hmm... that might crash', 'let's try'.
Keep replies under 150 words unless we're deep in code. Stay in character—no breaking fourth wall.

Debug Rules (VETR loop):
1. Phase 0: Guardrails – syntax, types, lint. Fix obvious crap first.
2. Phase 1: Verify – run all tests.
3. Phase 2: Explain – list 2-5 bug guesses, pick one root cause, explain wrong code line-by-line, trace variables, plan fix.
4. Phase 3: Repair – smallest change possible.
5. Phase 4: New tests – add 2-4 GIVEN/WHEN/THEN.
6. Phase 5: Simulate – step-through code manually.
7. Phase 6: Validate + Decay – re-run everything. If iteration >=4 and improvement <20% -> "Strategic Fresh Start".
8. Phase 7: End – all pass + confidence >=92? Output final.`;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            startAudioCapture();
          },
          onmessage: (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioCtxRef.current) playPcmChunk(base64Audio, audioCtxRef.current, isSoundOnRef.current);
            
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) setMessages(prev => [...prev, { role: 'model', text: part.text }]);
              }
            }
          },
          onclose: () => { setIsLive(false); stopAudioCapture(); },
          onerror: (err: any) => { 
            console.error("Live API Error:", err); 
            setIsLive(false); 
            stopAudioCapture(); 
            let errorMsg = 'Error connecting to Live API.';
            if (err?.status === 403) errorMsg = 'Error: API Key is invalid or missing required scopes.';
            setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Failed to connect to Live API", err);
      let errorMsg = 'Failed to connect to Live API.';
      if (err?.status === 403) errorMsg = 'Error: API Key is invalid or missing required scopes.';
      setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
    }
  };

  const disconnectLive = () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setIsLive(false);
    stopAudioCapture();
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
  };

  const toggleLive = () => isLive ? disconnectLive() : connectLive();

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText;
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInputText('');

    if (isLive && sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text: textToSend });
    } else {
      try {
        if (!process.env.GEMINI_API_KEY) {
          setMessages(prev => [...prev, { role: 'system', text: 'Error: GEMINI_API_KEY is not set. Please check your environment variables.' }]);
          return;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        if (!chatSessionRef.current) {
          chatSessionRef.current = ai.chats.create({
            model: "gemini-3.1-pro-preview",
            config: {
              systemInstruction: "You are Nebula, an expert AI dev partner. Help the user build their application, write code, and design systems. Be concise and helpful."
            }
          });
        }
        
        setMessages(prev => [...prev, { role: 'model', text: '' }]);
        
        const responseStream = await chatSessionRef.current.sendMessageStream({ message: textToSend });
        let currentText = '';
        
        for await (const chunk of responseStream) {
          if (chunk.text) {
            currentText += chunk.text;
            setMessages(prev => {
              const newMsgs = [...prev];
              newMsgs[newMsgs.length - 1] = { role: 'model', text: currentText };
              return newMsgs;
            });
          }
        }
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        let errorMsg = 'Error connecting to Gemini API.';
        if (error?.status === 403) {
          errorMsg = 'Error: API Key is invalid or missing required scopes.';
        } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
          errorMsg = 'Error: Failed to fetch. This usually means your GEMINI_API_KEY is invalid, missing, or blocked by CORS due to an invalid key.';
        } else if (error?.message?.includes('Failed to fetch')) {
          errorMsg = 'Error: Failed to fetch. Please verify your GEMINI_API_KEY is correct and has the necessary permissions.';
        }
        setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
      }
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
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-13 no-bold focus:outline-none focus:border-cyan-500/50 resize-none h-20 placeholder:text-slate-600 transition-all" 
            placeholder={isLive ? "Listening or type here..." : "Start a call or type here..."}
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button onClick={handleSendText} className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-container/20 text-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.2)] transition-all">
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
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-cyan-300 transition-all" title="Upload File">
            <span className="material-symbols-outlined text-18">attach_file</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
