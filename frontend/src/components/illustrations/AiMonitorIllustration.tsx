// src/components/illustrations/AiMonitorIllustration.tsx
// Pure SVG — no props, no logic, no narrative text. Static data lives here.

const NN_NODES = [
  { x: 45,  y: 55  }, { x: 115, y: 28  }, { x: 185, y: 68  }, { x: 255, y: 38  },
  { x: 325, y: 58  }, { x: 400, y: 25  }, { x: 470, y: 62  }, { x: 535, y: 40  },
  { x: 60,  y: 145 }, { x: 140, y: 125 }, { x: 215, y: 155 }, { x: 290, y: 130 },
  { x: 365, y: 148 }, { x: 440, y: 122 }, { x: 510, y: 150 },
  { x: 30,  y: 240 }, { x: 105, y: 260 }, { x: 180, y: 228 }, { x: 265, y: 248 },
  { x: 345, y: 232 }, { x: 425, y: 252 }, { x: 500, y: 235 },
  { x: 55,  y: 340 }, { x: 130, y: 318 }, { x: 210, y: 345 }, { x: 295, y: 325 },
  { x: 375, y: 342 }, { x: 455, y: 322 }, { x: 530, y: 348 },
];

const NN_EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],
  [0,8],[1,8],[1,9],[2,9],[2,10],[3,10],[3,11],[4,11],[4,12],[5,12],[5,13],[6,13],[6,14],[7,14],
  [8,9],[9,10],[10,11],[11,12],[12,13],[13,14],
  [8,15],[9,16],[10,16],[10,17],[11,17],[11,18],[12,18],[12,19],[13,19],[13,20],[14,20],[14,21],
  [15,16],[16,17],[17,18],[18,19],[19,20],[20,21],
  [15,22],[16,22],[16,23],[17,23],[17,24],[18,24],[18,25],[19,25],[19,26],[20,26],[20,27],[21,27],[21,28],
  [22,23],[23,24],[24,25],[25,26],[26,27],[27,28],
];

const HEX_PTS = [
  { x: 421, y: 468 }, { x: 408, y: 447 }, { x: 383, y: 447 },
  { x: 370, y: 468 }, { x: 383, y: 489 }, { x: 408, y: 489 },
];

const SCREEN_ROWS_BLUE   = [518, 527, 536, 545, 554];
const SCREEN_ROWS_PURPLE = [518, 527, 536];

const AMBIENT_PARTICLES = [
  { cx: 55,  cy: 400 }, { cx: 525, cy: 360 },
  { cx: 540, cy: 580 }, { cx: 28,  cy: 620 },
  { cx: 480, cy: 660 }, { cx: 80,  cy: 750 },
];

export default function AiMonitorIllustration() {
  return (
    <svg
      viewBox="-180 -130 940 1160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch" result="n"/>
          <feColorMatrix type="saturate" values="0" in="n" result="g"/>
          <feBlend in="SourceGraphic" in2="g" mode="overlay" result="b"/>
          <feComposite in="b" in2="SourceGraphic" operator="in"/>
        </filter>
        <radialGradient id="centerOrb" cx="50%" cy="60%" r="45%">
          <stop offset="0%"   stopColor="#6D8FA8" stopOpacity="0.20"/>
          <stop offset="55%"  stopColor="#8C84A8" stopOpacity="0.09"/>
          <stop offset="100%" stopColor="#4E6F89" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#7FAEC8" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#7FAEC8" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="laptopScreenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#1A3048"/>
          <stop offset="100%" stopColor="#3D6880"/>
        </linearGradient>
        <radialGradient id="humanHeadGrad" cx="45%" cy="40%" r="55%">
          <stop offset="0%"   stopColor="#FDFDFD" stopOpacity="0.96"/>
          <stop offset="100%" stopColor="#B8D0E0" stopOpacity="0.68"/>
        </radialGradient>
        <linearGradient id="flowHtoA" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#7FA3BC"/>
          <stop offset="100%" stopColor="#9E97BA"/>
        </linearGradient>
        <linearGradient id="flowAtoH" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#9E97BA"/>
          <stop offset="100%" stopColor="#7FA3BC"/>
        </linearGradient>
        <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#6D8FA8" stopOpacity="0"/>
          <stop offset="15%"  stopColor="#6D8FA8"/>
          <stop offset="85%"  stopColor="#8C84A8"/>
          <stop offset="100%" stopColor="#8C84A8" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="aiBrainGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#8C84A8" stopOpacity="0.26"/>
          <stop offset="100%" stopColor="#8C84A8" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="titleGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.08"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="stressGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#8C84A8"/>
          <stop offset="100%" stopColor="#B8B2CE"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="screenBloom">
          <feGaussianBlur stdDeviation="7" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <marker id="arrowBlue" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#7FA3BC" fillOpacity="0.7"/>
        </marker>
        <marker id="arrowPurple" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
          <path d="M6,0 L0,3 L6,6 Z" fill="#9E97BA" fillOpacity="0.7"/>
        </marker>
      </defs>

      <rect width="580" height="900" fill="white" fillOpacity="0.022" filter="url(#noise)"/>
      <ellipse cx="290" cy="540" rx="240" ry="220" fill="url(#centerOrb)"/>
      <ellipse cx="290" cy="120" rx="200" ry="90"  fill="url(#titleGlow)"/>

      {NN_EDGES.map(([a, b], i) => (
        <line key={`e${i}`}
          x1={NN_NODES[a].x} y1={NN_NODES[a].y}
          x2={NN_NODES[b].x} y2={NN_NODES[b].y}
          stroke="white" strokeWidth="0.5" strokeOpacity="0.06"/>
      ))}
      {NN_NODES.map((n, i) => (
        <circle key={`n${i}`} cx={n.x} cy={n.y} r="1.8" fill="white" fillOpacity="0.09"/>
      ))}

      {/* Human */}
      <circle cx="175" cy="455" r="30" fill="url(#humanHeadGrad)"/>
      <circle cx="175" cy="455" r="30" stroke="#C2D4DF" strokeWidth="1.2" strokeOpacity="0.55" fill="none"/>
      <rect x="168" y="483" width="14" height="16" rx="5" fill="white" fillOpacity="0.72"/>
      <path d="M 112 545 Q 118 498 175 497 Q 232 498 238 545 L 230 585 L 120 585 Z"
        fill="white" fillOpacity="0.14" stroke="#C2D4DF" strokeWidth="1.2" strokeOpacity="0.48"/>
      <path d="M 122 518 Q 100 550 96 580" stroke="white" strokeWidth="7" strokeLinecap="round" strokeOpacity="0.55" fill="none"/>
      <path d="M 228 518 Q 252 548 256 580" stroke="white" strokeWidth="7" strokeLinecap="round" strokeOpacity="0.55" fill="none"/>

      {/* Desk + Laptop */}
      <rect x="68"  y="582" width="220" height="9"  rx="4" fill="white" fillOpacity="0.15"/>
      <rect x="100" y="572" width="148" height="14" rx="4" fill="#233D55" fillOpacity="0.88"/>
      <rect x="102" y="572" width="144" height="3"  rx="1" fill="#4D7A96" fillOpacity="0.55"/>
      <path d="M 110 572 L 115 506 L 235 506 L 240 572 Z"
        fill="url(#screenGlow)" filter="url(#screenBloom)" fillOpacity="0.55"/>
      <path d="M 110 572 L 115 506 L 235 506 L 240 572 Z"
        fill="url(#laptopScreenGrad)" fillOpacity="0.92"/>
      <path d="M 110 572 L 115 506 L 235 506 L 240 572 Z"
        stroke="#6D9EBA" strokeWidth="1.5" strokeOpacity="0.65" fill="none"/>

      {SCREEN_ROWS_BLUE.map((y, i) => (
        <rect key={i} x={126} y={y} width={28 + (i % 3) * 18} height={3} rx={1.5}
          fill="#A8CCDF" fillOpacity={0.60}/>
      ))}
      {SCREEN_ROWS_PURPLE.map((y, i) => (
        <rect key={i} x={162} y={y} width={18 + (i % 2) * 12} height={3} rx={1.5}
          fill="#C8C4D8" fillOpacity={0.48}/>
      ))}

      {/* Stress indicator */}
      <text x="272" y="502" fill="white" fillOpacity="0.42" fontSize="8"
        fontFamily="Inter, sans-serif" fontWeight="500" letterSpacing="0.04em">STRESS</text>
      {[0, 1, 2, 3, 4].map(i => {
        const h = 6 + i * 4;
        const active = i < 3;
        return (
          <rect key={i} x={272 + i * 9} y={514 - h} width={6} height={h} rx={2}
            fill={active ? "url(#stressGrad)" : "white"}
            fillOpacity={active ? 0.70 : 0.15}/>
        );
      })}
      <text x="272" y="524" fill="white" fillOpacity="0.35" fontSize="7"
        fontFamily="Inter, sans-serif">Moderate</text>

      {/* Data flow */}
      <path d="M 258 530 C 295 515 328 505 360 500"
        stroke="url(#flowHtoA)" strokeWidth="1.6" fill="none" strokeOpacity="0.72"
        strokeDasharray="7 5" markerEnd="url(#arrowBlue)">
        <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.6s" repeatCount="indefinite"/>
      </path>
      <path d="M 360 518 C 328 528 295 538 258 548"
        stroke="url(#flowAtoH)" strokeWidth="1.2" fill="none" strokeOpacity="0.50"
        strokeDasharray="5 7" markerEnd="url(#arrowPurple)">
        <animate attributeName="stroke-dashoffset" from="0" to="22" dur="2.4s" repeatCount="indefinite"/>
      </path>
      <text x="295" y="496" fill="white" fillOpacity="0.28" fontSize="7.5"
        fontFamily="Inter, sans-serif" fontWeight="500" letterSpacing="0.06em" textAnchor="middle">Data</text>
      <text x="295" y="558" fill="white" fillOpacity="0.28" fontSize="7.5"
        fontFamily="Inter, sans-serif" fontWeight="500" letterSpacing="0.06em" textAnchor="middle">AI Decision</text>

      <circle r="3.5" fill="#7FA3BC" filter="url(#glow)">
        <animateMotion dur="2.0s" repeatCount="indefinite"
          path="M 258 530 C 295 515 328 505 360 500"/>
      </circle>
      <circle r="2.8" fill="#9E97BA" filter="url(#glow)">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.9s"
          path="M 360 518 C 328 528 295 538 258 548"/>
      </circle>

      {/* AI Brain */}
      <circle cx="396" cy="478" r="82" fill="url(#aiBrainGlow)"/>
      <circle cx="396" cy="478" r="64" fill="none" stroke="#8C84A8" strokeWidth="1.4" strokeOpacity="0.48"/>
      <circle cx="396" cy="478" r="64" fill="none" stroke="#8C84A8" strokeWidth="0.5" strokeOpacity="0.16" strokeDasharray="4 7"/>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return (
          <line key={i}
            x1={396 + 60 * Math.cos(a)} y1={478 + 60 * Math.sin(a)}
            x2={396 + 66 * Math.cos(a)} y2={478 + 66 * Math.sin(a)}
            stroke="#9E97BA" strokeWidth="1.4" strokeOpacity="0.52"/>
        );
      })}
      <circle cx="396" cy="478" r="46" fill="#3A5168" fillOpacity="0.48"/>
      <circle cx="396" cy="478" r="46" fill="none" stroke="#9E97BA" strokeWidth="0.9" strokeOpacity="0.34"/>
      {HEX_PTS.map((pt, i) => (
        <line key={i} x1={396} y1={478} x2={pt.x} y2={pt.y}
          stroke="#9E97BA" strokeWidth="1" strokeOpacity="0.52"/>
      ))}
      {([[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]] as [number, number][]).map(([a, b], i) => (
        <line key={i} x1={HEX_PTS[a].x} y1={HEX_PTS[a].y} x2={HEX_PTS[b].x} y2={HEX_PTS[b].y}
          stroke="#9E97BA" strokeWidth="0.8" strokeOpacity="0.28"/>
      ))}
      {HEX_PTS.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#8C84A8" fillOpacity="0.88"/>
      ))}
      <circle cx="396" cy="478" r="10" fill="#8C84A8" fillOpacity="0.70" filter="url(#softGlow)"/>
      <circle cx="396" cy="478" r="5"  fill="#D4D0E4"/>
      <text x="396" y="556" fill="white" fillOpacity="0.38" fontSize="8.5"
        fontFamily="Inter, sans-serif" fontWeight="600" letterSpacing="0.10em" textAnchor="middle">AI PROFILE</text>
      <circle r="3.5" fill="#B8B2CE" filter="url(#glow)">
        <animateMotion dur="6s" repeatCount="indefinite"
          path="M 396 414 A 64 64 0 1 1 395.99 414"/>
      </circle>

      {/* ECG / pulse */}
      <line x1="35" y1="720" x2="545" y2="720" stroke="white" strokeWidth="0.5" strokeOpacity="0.08"/>
      <path d="M 35 720 L 180 720 L 196 720 L 210 702 L 222 740 L 238 668 L 254 752 L 270 720 L 545 720"
        stroke="url(#pulseGrad)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 35 720 L 180 720 L 196 720 L 210 702 L 222 740 L 238 668 L 254 752 L 270 720 L 545 720"
        stroke="url(#pulseGrad)" strokeWidth="8" fill="none" strokeOpacity="0.10"
        strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 142 712 C 142 709 139 707 136 709 C 133 711 133 715 136 718 L 142 724 L 148 718 C 151 715 151 711 148 709 C 145 707 142 709 142 712 Z"
        fill="#9E97BA" fillOpacity="0.55"/>
      <text x="290" y="742" fill="white" fillOpacity="0.28" fontSize="7.5"
        fontFamily="Inter, sans-serif" fontWeight="500" letterSpacing="0.10em" textAnchor="middle">WELL-BEING INDICATOR</text>
      <circle r="4" fill="#7FA3BC" filter="url(#softGlow)">
        <animateMotion dur="3.2s" repeatCount="indefinite"
          path="M 35 720 L 180 720 L 196 720 L 210 702 L 222 740 L 238 668 L 254 752 L 270 720 L 545 720"/>
      </circle>

      {/* Ambient particles */}
      {AMBIENT_PARTICLES.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r="2" fill="#9AB8CC" fillOpacity="0.28">
          <animate attributeName="fillOpacity" values="0.28;0.06;0.28"
            dur={`${2.4 + i * 0.4}s`} begin={`${i * 0.35}s`} repeatCount="indefinite"/>
        </circle>
      ))}
    </svg>
  );
}
