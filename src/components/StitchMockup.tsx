import React, { useState, useEffect, useRef } from 'react';
import { Rocket, ArrowRight, CheckCircle, Palette, Save, Trash2, Camera, List, Code, User, ChevronLeft, ChevronRight, Check, RefreshCw, Type, Image as ImageIcon, MousePointer2, Layers, Maximize2, Move } from 'lucide-react';

type Step = 'branding' | 'generating' | 'review' | 'pencil' | 'final';

interface Branding {
  appName: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  style: string;
}

export function StitchMockup({ onLock, pagesText }: { onLock: () => void, pagesText: string }) {
  const [step, setStep] = useState<Step>('branding');
  const [generations, setGenerations] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');
  const [branding, setBranding] = useState<Branding>({
    appName: '',
    logo: null,
    primaryColor: '#00ffff',
    secondaryColor: '#60009f',
    style: 'Modern & Minimal'
  });
  const [pencilElements, setPencilElements] = useState<{ id: string, x: number, y: number, label: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMockup = async () => {
    setError('');
    
    try {
      const response = await fetch('/api/stitch/mockup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pagesText: pagesText,
          branding: branding
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stitch Engine Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let svgCode = data.choices?.[0]?.message?.content || '';
      
      // Clean up markdown if present
      svgCode = svgCode.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();

      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgCode)}`;
      return dataUrl;
    } catch (err: any) {
      console.error("Failed to generate mockup:", err);
      throw err;
    }
  };

  const startInitialGenerations = async () => {
    setStep('generating');
    try {
      // Generate 3 variations in sequence (or parallel if API allows)
      const results = await Promise.all([
        generateMockup(),
        generateMockup(),
        generateMockup()
      ]);
      setGenerations(results);
      setStep('review');
    } catch (err: any) {
      setError(err.message || "Failed to generate mockups. Please try again.");
      setStep('review');
    }
  };

  const handleChooseDesign = () => {
    // Initialize pencil elements based on chosen design (mocked)
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

    // Validate type
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      alert('Only PNG and JPG files are accepted.');
      return;
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setBranding({ ...branding, logo: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleFinalApproval = () => {
    setStep('final');
    setTimeout(() => {
      onLock();
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#020810] overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-8 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-headline text-cyan-100">UI/UX Workflow</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {[
              { id: 'branding', label: 'Branding' },
              { id: 'generating', label: 'Stitch' },
              { id: 'review', label: 'Selection' },
              { id: 'pencil', label: 'Pencil' }
            ].map((s, i) => (
              <React.Fragment key={s.id}>
                <div className={`text-[10px] font-headline uppercase tracking-widest ${step === s.id ? 'text-cyan-300' : 'text-slate-600'}`}>
                  {s.label}
                </div>
                {i < 3 && <div className="w-4 h-px bg-white/10"></div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        {step === 'branding' && (
          <div className="w-full max-w-2xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-headline text-slate-100">Branding & Identity</h2>
              <p className="text-slate-400">Define the visual core of your application before Stitch generates your designs.</p>
            </div>

            <form onSubmit={handleBrandingSubmit} className="flex flex-col gap-6 glass-panel p-8 rounded-2xl border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-headline text-slate-500 uppercase tracking-widest">App / Company Name</label>
                  <input 
                    type="text"
                    required
                    value={branding.appName}
                    onChange={e => setBranding({...branding, appName: e.target.value})}
                    placeholder="e.g. Nebula Core"
                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:border-cyan-500/50 outline-none transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-headline text-slate-500 uppercase tracking-widest">Logo (PNG/JPG, max 5MB)</label>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-slate-500 overflow-hidden">
                      {branding.logo ? (
                        <img src={branding.logo} alt="Logo Preview" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-6 h-6" />
                      )}
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept=".png,.jpg,.jpeg"
                      className="hidden"
                    />
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {branding.logo ? 'Change Logo' : 'Upload Logo'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-headline text-slate-500 uppercase tracking-widest">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color"
                      value={branding.primaryColor}
                      onChange={e => setBranding({...branding, primaryColor: e.target.value})}
                      className="w-12 h-12 rounded-lg bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-sm font-mono text-slate-400 uppercase">{branding.primaryColor}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-headline text-slate-500 uppercase tracking-widest">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color"
                      value={branding.secondaryColor}
                      onChange={e => setBranding({...branding, secondaryColor: e.target.value})}
                      className="w-12 h-12 rounded-lg bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-sm font-mono text-slate-400 uppercase">{branding.secondaryColor}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-headline text-slate-500 uppercase tracking-widest">Style Preference</label>
                <select 
                  value={branding.style}
                  onChange={e => setBranding({...branding, style: e.target.value})}
                  className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:border-cyan-500/50 outline-none transition-all appearance-none"
                >
                  <option value="Modern & Minimal">Modern & Minimal</option>
                  <option value="Bold & Vibrant">Bold & Vibrant</option>
                  <option value="Professional & Corporate">Professional & Corporate</option>
                  <option value="Playful & Friendly">Playful & Friendly</option>
                  <option value="Dark & Futuristic">Dark & Futuristic</option>
                </select>
              </div>

              <button 
                type="submit"
                className="mt-4 w-full py-4 bg-cyan-500 text-black rounded-xl font-headline font-medium hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
              >
                Generate 3 Stitch Variations
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
              <Rocket className="absolute inset-0 m-auto w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-2xl font-headline text-cyan-100">Stitch is crafting 3 variations...</h2>
              <p className="text-slate-400 text-sm">Using branding input & Master Plan architecture</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="w-full max-w-6xl flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-headline text-slate-100">Choose your design direction</h2>
              <p className="text-slate-400">Select one of the 3 variations generated by Stitch based on your branding.</p>
            </div>

            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {generations.map((gen, idx) => (
                <div 
                  key={idx}
                  className={`group relative flex flex-col gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                    currentIndex === idx 
                      ? 'bg-cyan-500/5 border-cyan-500/50 shadow-[0_0_30px_rgba(0,255,255,0.1)]' 
                      : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                  }`}
                  onClick={() => setCurrentIndex(idx)}
                >
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black/40 border border-white/5 relative">
                    <img 
                      src={gen} 
                      alt={`Variation ${idx + 1}`} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-headline text-cyan-300 uppercase tracking-widest">
                      Option {idx + 1}
                    </div>
                  </div>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); handleChooseDesign(); }}
                    className={`w-full py-3 rounded-xl font-headline text-sm transition-all flex items-center justify-center gap-2 ${
                      currentIndex === idx 
                        ? 'bg-cyan-500 text-black hover:bg-cyan-400' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Choose this design
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'pencil' && (
          <div className="w-full h-full flex flex-col gap-6 animate-in fade-in duration-700">
            <div className="flex justify-between items-end">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-headline text-slate-100">Pencil Refinement</h2>
                <p className="text-slate-400 text-sm">Fine-tune the layout, spacing, and components of your chosen design.</p>
              </div>
              <button 
                onClick={handleFinalApproval}
                className="px-8 py-3 bg-green-500 text-black rounded-full font-headline font-medium hover:bg-green-400 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
              >
                <Check className="w-4 h-4" />
                UI/UX Approved
              </button>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Toolbar */}
              <div className="w-16 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center py-6 gap-6 shrink-0">
                <button className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300"><MousePointer2 className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500 hover:text-slate-300"><Move className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500 hover:text-slate-300"><Type className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg text-slate-500 hover:text-slate-300"><Layers className="w-5 h-5" /></button>
                <div className="w-8 h-px bg-white/10"></div>
                <button className="p-2 rounded-lg text-slate-500 hover:text-slate-300"><Maximize2 className="w-5 h-5" /></button>
              </div>

              {/* Canvas Area */}
              <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 overflow-hidden relative group">
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[360px] h-[640px] bg-[#0a0a0a] rounded-3xl border-8 border-slate-800 shadow-2xl overflow-hidden relative">
                    <img 
                      src={generations[currentIndex]} 
                      alt="Refining Design" 
                      className="w-full h-full object-cover opacity-90"
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Mock Pencil Elements for "Refinement" */}
                    {pencilElements.map(el => (
                      <div 
                        key={el.id}
                        className="absolute border border-cyan-500/50 bg-cyan-500/10 backdrop-blur-sm px-3 py-1.5 rounded text-[10px] font-headline text-cyan-300 cursor-move hover:bg-cyan-500/20 transition-colors"
                        style={{ left: el.x, top: el.y }}
                      >
                        {el.label}
                      </div>
                    ))}

                    {/* Branding Overlay */}
                    <div className="absolute top-8 left-6 flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-cyan-500 flex items-center justify-center text-[10px] text-black font-bold">
                        {branding.appName.charAt(0) || 'N'}
                      </div>
                      <span className="text-xs font-headline text-white">{branding.appName || 'Nebula'}</span>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-8 text-xs font-headline text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: branding.primaryColor }}></div> Primary</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: branding.secondaryColor }}></div> Secondary</div>
                  <div className="text-cyan-400">{branding.style}</div>
                </div>
              </div>

              {/* Inspector */}
              <div className="w-64 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-6 shrink-0">
                <h3 className="text-xs font-headline text-slate-500 uppercase tracking-widest">Inspector</h3>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-600 uppercase">Layout</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 p-2 rounded border border-white/5 text-[10px] text-slate-400">X: 100px</div>
                      <div className="bg-white/5 p-2 rounded border border-white/5 text-[10px] text-slate-400">Y: 200px</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-600 uppercase">Typography</span>
                    <div className="bg-white/5 p-2 rounded border border-white/5 text-[10px] text-slate-400">Inter, 16px, Medium</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-600 uppercase">Spacing</span>
                    <div className="bg-white/5 p-2 rounded border border-white/5 text-[10px] text-slate-400">Padding: 24px</div>
                  </div>
                </div>

                <div className="mt-auto p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <p className="text-[10px] text-cyan-300 leading-relaxed">
                    Pencil mode active. All adjustments are being synchronized with the architecture spec.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'final' && (
          <div className="flex flex-col items-center justify-center h-full gap-8 animate-in zoom-in duration-500">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-black shadow-[0_0_40px_rgba(34,197,94,0.4)]">
              <Check className="w-10 h-10" />
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-3xl font-headline text-slate-100">UI/UX Approved!</h2>
              <p className="text-slate-400">Finalizing design assets and preparing for code generation phase.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
