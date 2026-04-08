import React, { useState, useEffect, useRef } from 'react';
// import { GoogleGenAI } from '@google/genai';

export function StitchMockup({ onLock, pagesText }: { onLock: () => void, pagesText: string }) {
  const [step, setStep] = useState<'generating' | 'review'>('generating');
  const [generations, setGenerations] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');
  const hasStartedRef = useRef(false);

  const generateMockup = async () => {
    setStep('generating');
    setError('');
    
    try {
      if (!process.env.GROK_API_KEY) {
        throw new Error("GROK_API_KEY is not set.");
      }

      // Connect to Grok 4.1 via Backend Proxy
      const response = await fetch('/api/grok/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ 
            role: 'user', 
            content: `Generate a single SVG mockup based ONLY on this Master Plan data:
        
${pagesText}

Return ONLY valid SVG code. No markdown formatting, no explanation.` 
          }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let svgCode = data.choices?.[0]?.message?.content || '';
      
      // Clean up markdown if present
      svgCode = svgCode.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();

      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgCode)}`;

      setGenerations(prev => {
        const newGens = [...prev, dataUrl];
        setCurrentIndex(newGens.length - 1);
        return newGens;
      });
      setStep('review');
    } catch (err: any) {
      console.error("Failed to generate mockup:", err);
      setError(err.message || "Failed to generate mockup. Please try again.");
      setStep('review'); // Go to review to show error
    }
  };

  useEffect(() => {
    if (!hasStartedRef.current && generations.length === 0) {
      hasStartedRef.current = true;
      generateMockup();
    }
  }, []);

  const handleRegenerate = () => {
    if (generations.length < 3) {
      generateMockup();
    }
  };

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(generations.length - 1, prev + 1));
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8">
      {step === 'generating' && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
          <h2 className="text-xl font-headline text-cyan-100">Stitch API Generating...</h2>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col items-center w-full max-w-5xl gap-6">
          {error && <div className="text-red-400 mb-4">{error}</div>}
          
          {generations.length > 0 && (
            <>
              <div className="relative w-full aspect-video bg-black/40 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
                <img 
                  src={generations[currentIndex]} 
                  alt={`Generation ${currentIndex + 1}`} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                
                {/* Navigation Arrows */}
                <div className="absolute inset-x-4 flex justify-between items-center pointer-events-none">
                  <button 
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 disabled:hover:bg-black/50 disabled:hover:border-white/10 transition-all backdrop-blur-md"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <button 
                    onClick={handleNext}
                    disabled={currentIndex === generations.length - 1}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 disabled:hover:bg-black/50 disabled:hover:border-white/10 transition-all backdrop-blur-md"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-4">
                <button 
                  onClick={handleRegenerate}
                  disabled={generations.length >= 3}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 transition-all font-headline font-medium"
                >
                  <span className="material-symbols-outlined text-18">refresh</span>
                  Regenerate
                </button>
                
                <button 
                  onClick={onLock}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] transition-all font-headline font-medium"
                >
                  <span className="material-symbols-outlined text-18">check</span>
                  Select
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
