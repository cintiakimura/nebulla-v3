export function Logo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cosmic-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#6a0dad', stopOpacity: 1 }}></stop>
          <stop offset="100%" style={{ stopColor: '#00ffff', stopOpacity: 1 }}></stop>
        </linearGradient>
        <filter height="200%" id="ring-glow" width="200%" x="-50%" y="-50%">
          <feGaussianBlur result="blur" stdDeviation="3"></feGaussianBlur>
          <feComposite in="SourceGraphic" in2="blur" operator="over"></feComposite>
        </filter>
      </defs>
      {/* Ring with Glow */}
      <ellipse cx="128" cy="128" fill="none" filter="url(#ring-glow)" rx="110" ry="35" stroke="white" strokeWidth="4" style={{ opacity: 0.9 }} transform="rotate(-15, 128, 128)"></ellipse>
      {/* Sleek Four-Pointed Star */}
      <path d="M128 20 C140 100 160 116 236 128 C160 140 140 156 128 236 C116 156 96 140 20 128 C96 116 116 100 128 20 Z" fill="url(#cosmic-gradient)"></path>
      {/* Front part of the ring to create overlap effect */}
      <path d="M234.3 104.5 A110 35 -15 0 1 128 163 A110 35 -15 0 1 21.7 151.5" fill="none" filter="url(#ring-glow)" stroke="white" strokeWidth="4" style={{ opacity: 0.9 }}></path>
    </svg>
  );
}
