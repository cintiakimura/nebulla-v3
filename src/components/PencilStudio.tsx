import React, { useState, useRef } from 'react';
import { Rocket, ArrowRight, CheckCircle, Palette, Check, Type, Image as ImageIcon, MousePointer2, Layers, Maximize2, Move } from 'lucide-react';

type Step = 'branding' | 'generating' | 'review' | 'pencil' | 'final';

/** One mockup slot: image URL for preview + raw SVG for approve (no shared mutable state). */
type GenerationSlot = { dataUrl: string; svg: string };

interface Branding {
  appName: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  style: string;
}

export function PencilStudio({
  onLock,
  pagesText,
  onBeforeGenerate,
}: {
  onLock: () => void;
  pagesText: string;
  /** Opens nebula-sysh-ui-sysh-studio.md in the IDE when user starts generation. */
  onBeforeGenerate?: () => void;
}) {
  const [step, setStep] = useState<Step>('branding');
  const [generations, setGenerations] = useState<GenerationSlot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');
  const [branding, setBranding] = useState<Branding>({
    appName: '',
    logo: null,
    primaryColor: '#00ffff',
    secondaryColor: '#60009f',
    style: 'Modern & Minimal',
  });
  const [pencilElements, setPencilElements] = useState<{ id: string; x: number; y: number; label: string }[]>([]);
  const [regenerateCount, setRegenerateCount] = useState(0);
  const [generatedCode, setGeneratedCode] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMockup = async (): Promise<GenerationSlot> => {
    setError('');
    const response = await fetch('/api/nebula-ui-studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagesText, branding }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nebula UI Studio Engine Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let svgCode = data.svg || data.choices?.[0]?.message?.content || '';
    svgCode = String(svgCode)
      .replace(/```xml/g, '')
      .replace(/```svg/g, '')
      .replace(/```/g, '')
      .trim();
    const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) svgCode = svgMatch[0];
    if (!svgCode || !/<svg/i.test(svgCode)) {
      svgCode = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect fill="#0e273d" width="400" height="280"/><text x="50%" y="50%" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" dominant-baseline="middle">Preview unavailable — check PENCIL_API_KEY and try again.</text></svg>`;
    }
    const base64Svg = btoa(unescape(encodeURIComponent(svgCode)));
    return { dataUrl: `data:image/svg+xml;base64,${base64Svg}`, svg: svgCode };
  };

  const startInitialGenerations = async () => {
    onBeforeGenerate?.();
    setStep('generating');
    try {
      const results = await Promise.all([generateMockup(), generateMockup(), generateMockup()]);
      setGenerations(results);
      setRegenerateCount(0);
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Failed to generate mockups. Please try again.');
      setGenerations([]);
      setStep('review');
    }
  };

  const handleChooseDesign = (index: number) => {
    setCurrentIndex(index);
    const slot = generations[index];
    if (slot?.svg) setGeneratedCode(slot.svg);
    setPencilElements([
      { id: '1', x: 100, y: 100, label: 'Header' },
      { id: '2', x: 100, y: 200, label: 'Hero Section' },
      { id: '3', x: 100, y: 400, label: 'Feature Grid' },
      { id: '4', x: 100, y: 600, label: 'Footer' },
    ]);
    setStep('pencil');
  };

  const handleBrandingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startInitialGenerations();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return alert('Only PNG and JPG files are accepted.');
    if (file.size > 5 * 1024 * 1024) return alert('File size must be less than 5MB.');
    const reader = new FileReader();
    reader.onload = (event) => setBranding({ ...branding, logo: event.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleFinalApproval = () => {
    fetch('/api/nebula-ui-studio/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: generatedCode }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || 'Failed to save approved code');
        }
        setStep('final');
        setTimeout(() => onLock(), 2000);
      })
      .catch((err: any) => setError(err.message || 'Failed to save approved code'));
  };

  const handleRegenerate = async () => {
    if (regenerateCount >= 3) return;
    try {
      const regenerated = await generateMockup();
      setGenerations((prev) => {
        const next = [...prev];
        next[currentIndex] = regenerated;
        return next;
      });
      setGeneratedCode(regenerated.svg);
      setRegenerateCount((v) => v + 1);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate design');
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full w-full bg-[#020810] overflow-hidden">
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-8 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-headline text-cyan-100">Nebulla UI Studio</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        {step === 'branding' && (
          <div className="w-full max-w-2xl flex flex-col gap-8">
            <form onSubmit={handleBrandingSubmit} className="flex flex-col gap-6 glass-panel p-8 rounded-2xl border border-white/10">
              <input required value={branding.appName} onChange={(e) => setBranding({ ...branding, appName: e.target.value })} placeholder="App name" className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-200" />
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept=".png,.jpg,.jpeg" className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-cyan-400">{branding.logo ? 'Change Logo' : 'Upload Logo'}</button>
              <p className="text-xs text-slate-500">
                Uses the prompt saved in <code className="text-cyan-400/90">nebula-sysh-ui-sysh-studio.md</code> (from Grok after Pages and Navigation), plus <code className="text-cyan-400/90">SKILL.md</code> on the server. Regenerate up to 3× on the chosen variation.
              </p>
              <button type="submit" className="mt-4 w-full py-4 bg-cyan-500 text-black rounded-xl font-headline flex items-center justify-center gap-2">
                Generate 3 variations <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
        {step === 'generating' && <div className="flex flex-col items-center justify-center h-full gap-8"><div className="w-24 h-24 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" /><Rocket className="w-8 h-8 text-cyan-400" /></div>}
        {step === 'review' && (
          <div className="w-full max-w-6xl flex flex-col gap-8">
            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">{error}</div>}
            {generations.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-slate-400 text-sm text-center max-w-md">No mockups were generated. Add <code className="text-cyan-400">PENCIL_API_KEY</code> in <code className="text-cyan-400">.env</code> or retry.</p>
                <button
                  type="button"
                  onClick={() => setStep('branding')}
                  className="px-6 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-sm font-headline"
                >
                  Back to branding
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {generations.map((gen, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-white/5" onClick={() => setCurrentIndex(idx)}>
                  <img src={gen.dataUrl} alt={`Variation ${idx + 1}`} className="w-full min-h-[160px] object-contain bg-black/20 rounded-lg" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChooseDesign(idx);
                    }}
                    className="w-full mt-3 py-3 rounded-xl font-headline text-sm flex items-center justify-center gap-2 bg-cyan-500 text-black"
                  >
                    <CheckCircle className="w-4 h-4" /> Choose this design
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerateCount >= 3}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-slate-300 disabled:opacity-50"
              >
                Regenerate ({regenerateCount}/3)
              </button>
            </div>
          </div>
        )}
        {step === 'pencil' && (
          <div className="w-full h-full flex flex-col gap-6">
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-headline text-slate-100">Nebula UI Studio Refinement</h2>
              <button onClick={handleFinalApproval} className="px-8 py-3 bg-green-500 text-black rounded-full font-headline flex items-center gap-2">
                <Check className="w-4 h-4" /> Approve UI/UX
              </button>
            </div>
            <div className="flex-1 flex gap-6 overflow-hidden">
              <div className="w-16 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center py-6 gap-6 shrink-0">
                <button className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300"><MousePointer2 className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500"><Move className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500"><Type className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500"><Layers className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500"><Maximize2 className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 overflow-hidden relative min-h-[280px]">
                {generations[currentIndex] ? (
                  <img src={generations[currentIndex].dataUrl} alt="Refining Design" className="w-full h-full object-contain opacity-90" />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm p-6">No preview image</div>
                )}
                {pencilElements.map((el) => (
                  <div key={el.id} className="absolute border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 rounded text-[10px] text-cyan-300" style={{ left: el.x, top: el.y }}>
                    {el.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {step === 'final' && (
          <div className="flex flex-col items-center justify-center gap-6 py-16 max-w-lg mx-auto text-center">
            <CheckCircle className="w-16 h-16 text-emerald-400" />
            <h3 className="text-xl font-headline text-slate-100">UI/UX approved</h3>
            <p className="text-sm text-slate-400">Your approved design is saved for the build pipeline. Returning to Master Plan…</p>
          </div>
        )}
      </div>
    </div>
  );
}
