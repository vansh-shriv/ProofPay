import { useRef } from 'react';

const MAX_TILT = 11; // degrees of extra tilt toward the pointer
const SHIELD = 'M180 74L238 95v46c0 38-25 62-58 76-33-14-58-38-58-76V95z';
const CHECK = 'M154 142l20 20 37-43';
const SLICES = 14; // the shield is built from stacked slices so it has real thickness
const STEP = 1.7; // px between slices

/**
 * The hero logo as a solid 3D object. The shield is extruded from stacked slices (side wall + front face), the check mark is
 * raised from its surface, and the wordmark is extruded too. Everything sits in a perspective scene at a slight angle, so the
 * depth is visible at rest; moving the pointer tilts the whole object further and the layers parallax against each other.
 * Touch input and prefers-reduced-motion keep the resting pose with no motion.
 */
export function BrandStage() {
  const card = useRef<HTMLDivElement>(null);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const el = card.current;
    if (!el || e.pointerType === 'touch' || reduce()) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty('--ry', ((px - 0.5) * 2 * MAX_TILT).toFixed(2));
    el.style.setProperty('--rx', ((0.5 - py) * 2 * MAX_TILT).toFixed(2));
    el.dataset.active = '1';
  }

  function leave() {
    const el = card.current;
    if (!el) return;
    el.style.setProperty('--rx', '0');
    el.style.setProperty('--ry', '0');
    delete el.dataset.active;
  }

  const rings = Array.from({ length: 11 }, (_, i) => 36 + i * 13);
  const rays = Array.from({ length: 60 }, (_, i) => i * 6);
  const front = SLICES * STEP;

  return (
    <div className="brandcard" ref={card} onPointerMove={move} onPointerLeave={leave} role="img" aria-label="ProofPay logo">
      <div className="tilt">
        {/* back plane: guilloche pattern (banknote-style security rings), faded at the edges */}
        <div className="layer l-rings" aria-hidden="true">
          <svg viewBox="0 0 360 290">
            <defs>
              <radialGradient id="em-fade" cx="50%" cy="48%" r="52%">
                <stop offset="0.35" stopColor="#fff" />
                <stop offset="1" stopColor="#000" />
              </radialGradient>
              <mask id="em-mask"><rect width="360" height="290" fill="url(#em-fade)" /></mask>
            </defs>
            <g mask="url(#em-mask)" fill="none" stroke="var(--emb-line)">
              {rings.map((r) => <circle key={r} cx="180" cy="140" r={r} strokeWidth="1" />)}
              {rays.map((a) => <line key={a} x1="180" y1="72" x2="180" y2="-30" strokeWidth="0.8" transform={`rotate(${a} 180 140)`} />)}
            </g>
          </svg>
        </div>

        {/* notched stamp ring */}
        <div className="layer l-stamp" aria-hidden="true">
          <svg viewBox="0 0 360 290">
            <circle className="emb-spin" cx="180" cy="140" r="96" fill="none" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="2.2" strokeDasharray="1.2 7.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* the solid shield: side wall slices, front face, raised check */}
        <div className="layer l-shield" aria-hidden="true">
          {Array.from({ length: SLICES }, (_, i) => (
            <div key={i} className="slice" style={{ transform: `translateZ(${(i * STEP).toFixed(2)}px)` }}>
              <svg viewBox="0 0 360 290"><path d={SHIELD} fill="var(--emb-side)" /></svg>
            </div>
          ))}
          <div className="slice" style={{ transform: `translateZ(${front.toFixed(2)}px)` }}>
            <svg viewBox="0 0 360 290">
              <defs>
                <linearGradient id="em-metal" x1="0.1" y1="0" x2="0.9" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--emb-a)' }} />
                  <stop offset="1" style={{ stopColor: 'var(--emb-b)' }} />
                </linearGradient>
              </defs>
              <path d={SHIELD} fill="url(#em-metal)" />
              <path d="M180 74L122 95v46c0 38 25 62 58 76z" fill="#fff" opacity="0.07" />
              <path d="M180 85l48 17.500V141c0 31-20.500 51-48 63-27.500-12-48-32-48-63v-38.500z" fill="none" stroke="var(--bg)" strokeOpacity="0.26" strokeWidth="1.5" />
            </svg>
          </div>
          {[0, 1, 2, 3].map((j) => (
            <div key={`c${j}`} className="slice" style={{ transform: `translateZ(${(front + 1 + j * 1.4).toFixed(2)}px)` }}>
              <svg viewBox="0 0 360 290"><path d={CHECK} fill="none" stroke="var(--emb-check-side)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          ))}
          <div className="slice" style={{ transform: `translateZ(${(front + 6).toFixed(2)}px)` }}>
            <svg viewBox="0 0 360 290"><path d={CHECK} fill="none" stroke="var(--bg)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>

        {/* extruded wordmark */}
        <div className="layer l-word" aria-hidden="true"><div className="emb-word"><b>Proof</b>Pay</div></div>
      </div>
    </div>
  );
}
