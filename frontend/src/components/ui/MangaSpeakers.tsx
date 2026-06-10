"use client"

export function MangaSpeakers() {
  return (
    <>
      {/* ===== LEFT SPEAKER ===== */}
      <div className="pointer-events-none fixed left-[-40px] top-1/2 -translate-y-1/2 z-0 hidden lg:block" aria-hidden>
        <div className="relative">
          {/* Speaker cabinet */}
          <svg width="280" height="420" viewBox="0 0 280 420" fill="none" className="opacity-40">
            {/* Cabinet body */}
            <rect x="40" y="10" width="200" height="400" rx="24" fill="#111113" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
            {/* Woofer (big) */}
            <circle cx="140" cy="150" r="75" fill="#09090b" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
            <circle cx="140" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
            <circle cx="140" cy="150" r="45" fill="#0c0c0e" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
            <circle cx="140" cy="150" r="20" fill="#111113" stroke="rgba(255,255,255,0.05)" strokeWidth="1">
              <animate attributeName="r" values="20;23;20" dur="1.2s" repeatCount="indefinite"/>
            </circle>
            {/* Midrange */}
            <circle cx="140" cy="290" r="40" fill="#09090b" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5"/>
            <circle cx="140" cy="290" r="28" fill="#0c0c0e" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
            <circle cx="140" cy="290" r="12" fill="#111113" stroke="rgba(255,255,255,0.04)" strokeWidth="1">
              <animate attributeName="r" values="12;14;12" dur="0.9s" repeatCount="indefinite"/>
            </circle>
            {/* Tweeter */}
            <circle cx="140" cy="370" r="18" fill="#09090b" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            <circle cx="140" cy="370" r="8" fill="#111113">
              <animate attributeName="r" values="8;9.5;8" dur="0.7s" repeatCount="indefinite"/>
            </circle>
          </svg>

          {/* Manga sound waves - right side */}
          <svg className="absolute top-1/2 -translate-y-1/2 left-[220px]" width="300" height="400" viewBox="0 0 300 400" fill="none">
            {/* Speed lines */}
            <line x1="0" y1="80" x2="120" y2="60" stroke="rgba(255,255,255,0.04)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="x2" values="80;140;80" dur="1.8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.8s" repeatCount="indefinite"/>
            </line>
            <line x1="0" y1="130" x2="160" y2="120" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="x2" values="100;180;100" dur="1.5s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite"/>
            </line>
            <line x1="0" y1="180" x2="200" y2="175" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeLinecap="round">
              <animate attributeName="x2" values="140;220;140" dur="1.3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.3s" repeatCount="indefinite"/>
            </line>
            <line x1="0" y1="200" x2="250" y2="200" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" strokeLinecap="round">
              <animate attributeName="x2" values="180;270;180" dur="1.2s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite"/>
            </line>
            <line x1="0" y1="220" x2="200" y2="225" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeLinecap="round">
              <animate attributeName="x2" values="140;220;140" dur="1.3s" repeatCount="indefinite" begin="0.1s"/>
              <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.3s" repeatCount="indefinite" begin="0.1s"/>
            </line>
            <line x1="0" y1="270" x2="160" y2="280" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="x2" values="100;180;100" dur="1.5s" repeatCount="indefinite" begin="0.2s"/>
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" begin="0.2s"/>
            </line>
            <line x1="0" y1="320" x2="120" y2="340" stroke="rgba(255,255,255,0.04)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="x2" values="80;140;80" dur="1.8s" repeatCount="indefinite" begin="0.15s"/>
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.8s" repeatCount="indefinite" begin="0.15s"/>
            </line>

            {/* Curved waves */}
            <path d="M 20 100 Q 80 150 20 200" fill="none" stroke="rgba(168,85,247,0.08)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="d" values="M 20 100 Q 80 150 20 200;M 20 100 Q 120 150 20 200;M 20 100 Q 80 150 20 200" dur="2s" repeatCount="indefinite"/>
            </path>
            <path d="M 40 80 Q 120 150 40 220" fill="none" stroke="rgba(168,85,247,0.06)" strokeWidth="1.5" strokeLinecap="round">
              <animate attributeName="d" values="M 40 80 Q 120 150 40 220;M 40 80 Q 180 150 40 220;M 40 80 Q 120 150 40 220" dur="2s" repeatCount="indefinite" begin="0.3s"/>
            </path>
            <path d="M 60 60 Q 160 150 60 240" fill="none" stroke="rgba(168,85,247,0.04)" strokeWidth="1" strokeLinecap="round">
              <animate attributeName="d" values="M 60 60 Q 160 150 60 240;M 60 60 Q 240 150 60 240;M 60 60 Q 160 150 60 240" dur="2s" repeatCount="indefinite" begin="0.6s"/>
            </path>

            {/* Expanding circles from woofer */}
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite" begin="0.8s"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" begin="0.8s"/>
            </circle>
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite" begin="1.6s"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" begin="1.6s"/>
            </circle>
          </svg>
        </div>
      </div>

      {/* ===== RIGHT SPEAKER (mirrored) ===== */}
      <div className="pointer-events-none fixed right-[-40px] top-1/2 -translate-y-1/2 z-0 hidden lg:block" aria-hidden>
        <div className="relative" style={{ transform: "scaleX(-1)" }}>
          <svg width="280" height="420" viewBox="0 0 280 420" fill="none" className="opacity-40">
            <rect x="40" y="10" width="200" height="400" rx="24" fill="#111113" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
            <circle cx="140" cy="150" r="75" fill="#09090b" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
            <circle cx="140" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
            <circle cx="140" cy="150" r="45" fill="#0c0c0e" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
            <circle cx="140" cy="150" r="20" fill="#111113" stroke="rgba(255,255,255,0.05)" strokeWidth="1">
              <animate attributeName="r" values="20;23;20" dur="1.2s" repeatCount="indefinite" begin="0.1s"/>
            </circle>
            <circle cx="140" cy="290" r="40" fill="#09090b" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5"/>
            <circle cx="140" cy="290" r="28" fill="#0c0c0e" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
            <circle cx="140" cy="290" r="12" fill="#111113" stroke="rgba(255,255,255,0.04)" strokeWidth="1">
              <animate attributeName="r" values="12;14;12" dur="0.9s" repeatCount="indefinite" begin="0.15s"/>
            </circle>
            <circle cx="140" cy="370" r="18" fill="#09090b" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            <circle cx="140" cy="370" r="8" fill="#111113">
              <animate attributeName="r" values="8;9.5;8" dur="0.7s" repeatCount="indefinite" begin="0.2s"/>
            </circle>
          </svg>

          <svg className="absolute top-1/2 -translate-y-1/2 left-[220px]" width="300" height="400" viewBox="0 0 300 400" fill="none">
            <line x1="0" y1="80" x2="120" y2="60" stroke="rgba(255,255,255,0.04)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="x2" values="80;140;80" dur="1.8s" repeatCount="indefinite" begin="0.05s"/>
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.8s" repeatCount="indefinite" begin="0.05s"/>
            </line>
            <line x1="0" y1="130" x2="160" y2="120" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="x2" values="100;180;100" dur="1.5s" repeatCount="indefinite" begin="0.1s"/>
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" begin="0.1s"/>
            </line>
            <line x1="0" y1="180" x2="200" y2="175" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeLinecap="round">
              <animate attributeName="x2" values="140;220;140" dur="1.3s" repeatCount="indefinite" begin="0.15s"/>
              <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.3s" repeatCount="indefinite" begin="0.15s"/>
            </line>
            <line x1="0" y1="200" x2="250" y2="200" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" strokeLinecap="round">
              <animate attributeName="x2" values="180;270;180" dur="1.2s" repeatCount="indefinite" begin="0.08s"/>
              <animate attributeName="opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite" begin="0.08s"/>
            </line>
            <line x1="0" y1="220" x2="200" y2="225" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeLinecap="round">
              <animate attributeName="x2" values="140;220;140" dur="1.3s" repeatCount="indefinite" begin="0.2s"/>
              <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.3s" repeatCount="indefinite" begin="0.2s"/>
            </line>
            <line x1="0" y1="270" x2="160" y2="280" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="x2" values="100;180;100" dur="1.5s" repeatCount="indefinite" begin="0.25s"/>
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" begin="0.25s"/>
            </line>
            <line x1="0" y1="320" x2="120" y2="340" stroke="rgba(255,255,255,0.04)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="x2" values="80;140;80" dur="1.8s" repeatCount="indefinite" begin="0.3s"/>
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.8s" repeatCount="indefinite" begin="0.3s"/>
            </line>
            <path d="M 20 100 Q 80 150 20 200" fill="none" stroke="rgba(168,85,247,0.08)" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="d" values="M 20 100 Q 80 150 20 200;M 20 100 Q 120 150 20 200;M 20 100 Q 80 150 20 200" dur="2s" repeatCount="indefinite" begin="0.1s"/>
            </path>
            <path d="M 40 80 Q 120 150 40 220" fill="none" stroke="rgba(168,85,247,0.06)" strokeWidth="1.5" strokeLinecap="round">
              <animate attributeName="d" values="M 40 80 Q 120 150 40 220;M 40 80 Q 180 150 40 220;M 40 80 Q 120 150 40 220" dur="2s" repeatCount="indefinite" begin="0.4s"/>
            </path>
            <path d="M 60 60 Q 160 150 60 240" fill="none" stroke="rgba(168,85,247,0.04)" strokeWidth="1" strokeLinecap="round">
              <animate attributeName="d" values="M 60 60 Q 160 150 60 240;M 60 60 Q 240 150 60 240;M 60 60 Q 160 150 60 240" dur="2s" repeatCount="indefinite" begin="0.7s"/>
            </path>
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite" begin="0.1s"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" begin="0.1s"/>
            </circle>
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite" begin="0.9s"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" begin="0.9s"/>
            </circle>
            <circle cx="0" cy="200" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
              <animate attributeName="r" values="30;120" dur="2.5s" repeatCount="indefinite" begin="1.7s"/>
              <animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" begin="1.7s"/>
            </circle>
          </svg>
        </div>
      </div>
    </>
  )
}
