/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  RotateCcw, 
  Coins, 
  Trophy, 
  Zap, 
  Info,
  Volume2,
  VolumeX,
  Star,
  Lock,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants & Types ---

const ROWS = 3;
const COLS = 5;
const SPIN_DURATION = 2000;
const REEL_DELAY = 200;

// --- Sound Engine ---
const playSound = (type: 'spin' | 'stop' | 'win' | 'bigWin' | 'bonus' | 'land_standard' | 'land_wild' | 'land_scatter' | 'ambient_safari' | 'loss_thud', muted: boolean, winStreak = 0) => {
  if (muted || typeof window === 'undefined') return;
  
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playTone = (freq: number, startTime: number, duration: number, oscType: OscillatorType = 'sine', volume = 0.1) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    switch (type) {
      case 'spin':
        // Pitch rises as streak gets hotter
        const spinFreqMult = 1 + Math.min(0.6, winStreak * 0.15);
        playTone(70 * spinFreqMult, ctx.currentTime, 0.5, 'square', 0.03);
        playTone(60 * spinFreqMult, ctx.currentTime, 0.5, 'triangle', 0.05);
        if (winStreak >= 2) {
          // Additional rising synth tones to build anticipation
          for (let i = 0; i < 5; i++) {
            playTone(140 + (i * 70) * spinFreqMult, ctx.currentTime + (i * 0.08), 0.15, 'sawtooth', 0.02);
          }
        }
        break;
      case 'stop':
        const stopFreqMult = 1 + Math.min(0.4, winStreak * 0.1);
        playTone(120 * stopFreqMult, ctx.currentTime, 0.15, 'triangle', 0.1);
        break;
      case 'loss_thud':
        playTone(40, ctx.currentTime, 0.3, 'sine', 0.15);
        playTone(60, ctx.currentTime, 0.2, 'triangle', 0.1);
        break;
      case 'land_standard':
        playTone(180, ctx.currentTime, 0.1, 'sine', 0.05);
        break;
      case 'land_wild':
        playTone(330, ctx.currentTime, 0.2, 'sine', 0.1);
        playTone(440, ctx.currentTime + 0.05, 0.2, 'triangle', 0.08);
        break;
      case 'land_scatter':
        playTone(523, ctx.currentTime, 0.2, 'square', 0.05);
        playTone(659, ctx.currentTime + 0.05, 0.2, 'sine', 0.05);
        break;
      case 'win':
        // Win gets higher pitch and faster tempo on hot streak
        const winPitchShift = 1 + (winStreak * 0.06);
        const winInterval = Math.max(0.04, 0.1 - (winStreak * 0.015));
        [523.25, 659.25, 783.99].forEach((f, i) => {
          playTone(f * winPitchShift, ctx.currentTime + (i * winInterval), 0.4, 'sine', 0.1);
        });
        break;
      case 'bigWin':
        // Scaled pitch on bigger wins
        const bigWinPitchShift = 1 + (winStreak * 0.05);
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
          playTone(f * bigWinPitchShift, ctx.currentTime + (i * 0.1), 1.0, 'triangle', 0.1);
          playTone(f * 1.25 * bigWinPitchShift, ctx.currentTime + (i * 0.1), 0.8, 'square', 0.02);
          playTone(f * 1.5 * bigWinPitchShift, ctx.currentTime + (i * 0.1), 0.5, 'sine', 0.05);
        });
        break;
      case 'bonus':
        // Pronounced bonus trigger sound
        for (let i = 0; i < 5; i++) {
          const startTime = ctx.currentTime + (i * 0.15);
          playTone(440 * (1 + i * 0.2), startTime, 0.6, 'sawtooth', 0.05);
          playTone(880 * (1 + i * 0.1), startTime, 0.4, 'sine', 0.1);
        }
        playTone(220, ctx.currentTime, 2.0, 'sawtooth', 0.05);
        break;
      case 'ambient_safari':
        if (winStreak >= 2) {
          // Rhythmic tribal techno safari drumbeat layers under the experience on a winning streak
          playTone(55, ctx.currentTime, 0.15, 'triangle', 0.15); // Kick drum
          playTone(55, ctx.currentTime + 0.3, 0.1, 'triangle', 0.12); // Secondary hit
          playTone(2500, ctx.currentTime + 0.15, 0.02, 'sine', 0.015); // High-frequency click shaker
          playTone(2500, ctx.currentTime + 0.45, 0.02, 'sine', 0.015);
          if (winStreak >= 4) {
            // High-tempo synth notes join the melody
            playTone(440 + (winStreak * 20), ctx.currentTime + 0.3, 0.1, 'sine', 0.04);
          }
        } else {
          // Subtle ambient noises (insect buzzes, distant bird chirps simulated with oscillators)
          const frequency = 2000 + Math.random() * 1000;
          playTone(frequency, ctx.currentTime, 0.2, 'sine', 0.005);
          playTone(frequency * 1.5, ctx.currentTime + 0.1, 0.1, 'sine', 0.003);
        }
        break;
    }
  } catch (e) {
    console.warn('Audio context blocked or unavailable:', e);
  }
};

interface Symbol {
  id: string;
  emoji: string;
  value: number;
  label: string;
  color: string;
  type: 'standard' | 'wild' | 'scatter';
}

const SYMBOLS: Symbol[] = [
  { id: 'lion', emoji: '🦁', value: 500, label: 'Lion', color: 'from-orange-400 to-red-600', type: 'wild' },
  { id: 'paw', emoji: '🐾', value: 0, label: 'Scatter', color: 'from-yellow-300 to-amber-500', type: 'scatter' },
  { id: 'elephant', emoji: '🐘', value: 200, label: 'Elephant', color: 'from-blue-400 to-indigo-600', type: 'standard' },
  { id: 'zebra', emoji: '🦓', value: 100, label: 'Zebra', color: 'from-slate-300 to-slate-500', type: 'standard' },
  { id: 'monkey', emoji: '🐒', value: 50, label: 'Monkey', color: 'from-amber-600 to-orange-800', type: 'standard' },
  { id: 'parrot', emoji: '🦜', value: 20, label: 'Parrot', color: 'from-green-400 to-emerald-600', type: 'standard' },
  { id: 'banana', emoji: '🍌', value: 10, label: 'Banana', color: 'from-yellow-200 to-yellow-400', type: 'standard' },
  { id: 'leaf', emoji: '🌿', value: 5, label: 'Leaf', color: 'from-green-200 to-green-400', type: 'standard' },
];

const PAYLINES = [
  [1, 1, 1, 1, 1], // 1: Middle row
  [0, 0, 0, 0, 0], // 2: Top row
  [2, 2, 2, 2, 2], // 3: Bottom row
  [0, 1, 2, 1, 0], // 4: V-shape
  [2, 1, 0, 1, 2], // 5: Inverted V
  [0, 0, 1, 2, 2], // 6: Step down
  [2, 2, 1, 0, 0], // 7: Step up
  [1, 0, 1, 2, 1], // 8: M-shape
  [1, 2, 1, 0, 1], // 9: W-shape
  [0, 2, 0, 2, 0], // 10: Big Zigzag
  [2, 0, 2, 0, 2], // 11: Big Zigzag Inverted
  [1, 0, 0, 0, 1], // 12: Arch
  [1, 2, 2, 2, 1], // 13: Inverted arch
  [0, 1, 0, 1, 0], // 14: Top Zigzag
  [2, 1, 2, 1, 2], // 15: Bottom Zigzag
  [0, 2, 2, 2, 0], // 16: Deep Arch
  [2, 0, 0, 0, 2], // 17: Deep Inverted Arch
  [1, 1, 0, 1, 1], // 18: Middle Bump
  [1, 1, 2, 1, 1], // 19: Middle Dip
  [0, 1, 1, 1, 0], // 20: Top Flattened Arch
];

// --- Helper Functions ---

const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

const generateGrid = () => {
  return Array(COLS).fill(null).map(() => 
    Array(ROWS).fill(null).map(() => getRandomSymbol())
  );
};

// --- Coin Particle Animations ---
interface CoinParticle {
  id: number;
  delay: number;
  angle: number;
  speed: number;
  winStreak?: number;
}

const GoldCoin = ({ angle, speed, delay, winStreak = 0 }: { angle: number; speed: number; delay: number; winStreak?: number; key?: React.Key }) => {
  const radians = (angle * Math.PI) / 180;
  // Burst outwards from center of the screen
  const velocityX = Math.cos(radians) * speed * 380;
  const velocityY = Math.sin(radians) * speed * 300 - 100; // slightly boosted upwards velocity
  
  return (
    <motion.div
      initial={{ 
        left: "50%",
        top: "50%",
        x: "-50%",
        y: "-50%",
        scale: 0,
        rotate: 0,
        rotateY: 0,
        opacity: 0,
      }}
      animate={{
        x: ["-50%", `calc(-50% + ${velocityX * 0.4}px)`, `calc(-50% + ${velocityX}px)`],
        y: ["-50%", `calc(-50% + ${velocityY}px)`, "110vh"],
        scale: [0, 1.4, 1.1, 0.4],
        rotate: [0, 180 + Math.random() * 360],
        rotateY: [0, 360 * 3 + Math.random() * 720],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 1.5 + Math.random() * 0.8,
        delay: delay,
        ease: "easeOut",
      }}
      className={`absolute z-[100] pointer-events-none w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center font-sans ${
        winStreak >= 3 
          ? 'border-orange-200 bg-gradient-to-r from-orange-500 via-red-650 to-yellow-400 shadow-[0_0_22px_rgba(239,68,68,0.95),_inset_0_2px_4px_rgba(255,255,255,0.8)] animate-pulse'
          : winStreak >= 2
            ? 'border-yellow-100 bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.85),_inset_0_2px_4px_rgba(255,255,255,0.73)]'
            : 'border-yellow-200 bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 shadow-[0_4px_10px_rgba(0,0,0,0.55),_inset_0_2px_4px_rgba(255,255,255,0.73)]'
      }`}
      style={{
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'visible',
      }}
    >
      <div className={`w-[70%] h-[70%] rounded-full border flex items-center justify-center font-black text-[10px] sm:text-xs select-none ${
        winStreak >= 3 
          ? 'border-orange-600/40 bg-gradient-to-br from-red-400 via-orange-200 to-yellow-400 text-amber-950' 
          : 'border-yellow-600/40 bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-500 text-amber-950'
      }`}>
        {winStreak >= 3 ? '🔥' : '$'}
      </div>
    </motion.div>
  );
};

const CoinOverlay = ({ coins }: { coins: CoinParticle[] }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] w-screen h-screen overflow-hidden">
      <AnimatePresence>
        {coins.map((coin) => (
          <GoldCoin 
            key={coin.id} 
            angle={coin.angle} 
            speed={coin.speed} 
            delay={coin.delay}
            winStreak={coin.winStreak}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// --- Components ---

const PaylineOverlay = ({ 
  winningLines, 
  isSpinning, 
  wildMultipliers 
}: { 
  winningLines: number[]; 
  isSpinning: boolean; 
  wildMultipliers?: Record<number, number>; 
}) => {
  if (isSpinning || winningLines.length === 0) return null;

  return (
    <svg 
      className="absolute inset-0 pointer-events-none z-20 w-full h-full px-2 md:px-4" 
      viewBox="0 0 500 300" 
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {winningLines.map((lineIdx) => {
        const path = PAYLINES[lineIdx];
        const points = path.map((row, col) => {
          const x = (col * 100) + 50;
          const y = (row * 100) + 50;
          return `${x},${y}`;
        }).join(' ');

        const mult = wildMultipliers?.[lineIdx];
        
        return (
          <React.Fragment key={`line-group-${lineIdx}`}>
            <motion.polyline
              points={points}
              fill="none"
              stroke={mult && mult > 1 ? "#10b981" : "#fbbf24"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            {mult && mult > 1 && (
              <motion.g
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
              >
                <circle 
                  cx="250" 
                  cy={path[2] * 100 + 50} 
                  r="20" 
                  fill="#10b981" 
                  stroke="#ffffff" 
                  strokeWidth="3.5" 
                  filter="url(#glow)"
                />
                <circle 
                  cx="250" 
                  cy={path[2] * 100 + 50} 
                  r="17" 
                  fill="url(#emeraldGrad)" 
                />
                <text 
                  x="250" 
                  y={path[2] * 100 + 56} 
                  textAnchor="middle" 
                  fill="#ffffff" 
                  fontSize="13" 
                  fontWeight="950" 
                  fontFamily="Inter, system-ui, sans-serif"
                  style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.5)' }}
                >
                  {mult}x
                </text>
              </motion.g>
            )}
          </React.Fragment>
        );
      })}
    </svg>
  );
};

const SlotSymbol = ({ 
  symbol, 
  highlighted = false, 
  isLocked = false,
  onToggleLock = () => {},
  isSpinning = false
}: { 
  symbol: Symbol; 
  highlighted?: boolean; 
  isLocked?: boolean;
  onToggleLock?: () => void;
  key?: React.Key;
  isSpinning?: boolean;
}) => {
  if (isSpinning) {
    return (
      <div 
        className="w-full aspect-square flex items-center justify-center p-2 rounded-2xl bg-black/30 border border-white/5 opacity-85 select-none relative overflow-hidden"
        style={{ willChange: 'transform' }}
      >
        {/* Vertical directional motion blur streak highlight */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent pointer-events-none" />

        {/* Main emoji vertically stretched and blurred with directional motion blur */}
        <div 
          className="text-4xl md:text-5xl lg:text-7xl select-none relative z-10 filter blur-[0.8px]"
          style={{
            transform: 'scaleY(1.38) scaleX(0.86)',
            filter: 'url(#reel-directional-blur-medium) blur(0.8px)',
          }}
        >
          {symbol.emoji}
        </div>

        {/* Directional motion trail ghosts above and below */}
        <div 
          className="text-4xl md:text-5xl lg:text-7xl select-none absolute z-0 opacity-35 pointer-events-none"
          style={{
            transform: 'translateY(-14px) scaleY(1.45) scaleX(0.84)',
            filter: 'url(#reel-directional-blur) blur(2px)',
          }}
        >
          {symbol.emoji}
        </div>
        <div 
          className="text-4xl md:text-5xl lg:text-7xl select-none absolute z-0 opacity-35 pointer-events-none"
          style={{
            transform: 'translateY(14px) scaleY(1.45) scaleX(0.84)',
            filter: 'url(#reel-directional-blur) blur(2px)',
          }}
        >
          {symbol.emoji}
        </div>
      </div>
    );
  }

  const isWild = symbol.type === 'wild';

  return (
    <motion.div
      initial={isWild ? { scale: 0.3, y: 30, opacity: 0 } : { scale: 1, y: 0, opacity: 1 }}
      animate={
        highlighted 
          ? { scale: [1, 1.25, 1], rotate: [0, 4, -4, 0] } 
          : isWild
            ? { scale: 1, y: 0, opacity: 1 }
            : { scale: 1, y: 0, opacity: 1 }
      }
      transition={
        highlighted 
          ? { repeat: Infinity, duration: 0.6, ease: "easeInOut" } 
          : isWild
            ? { type: 'spring', stiffness: 220, damping: 11, delay: 0.05 }
            : { duration: 0.2 }
      }
      onClick={onToggleLock}
      className={`w-full aspect-square flex items-center justify-center p-2 rounded-2xl transition-all duration-300 relative cursor-pointer group ${
        highlighted 
          ? 'bg-emerald-500/20 shadow-[0_0_25px_rgba(16,185,129,0.4)] z-10 border-2 border-emerald-400' 
          : isLocked
            ? 'bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-2 border-amber-400 z-10'
            : isWild
              ? 'bg-gradient-to-br from-emerald-950/60 to-yellow-950/40 shadow-[0_0_22px_rgba(52,211,153,0.55)] border-[2.5px] border-emerald-400/95 z-10'
              : 'bg-black/40 shadow-inner border border-white/5 hover:bg-black/50'
      }`}
    >
      {/* Wild constant glow animations background */}
      {isWild && (
        <>
          {/* Pulsing Outer Aura Ripple */}
          <motion.div
            animate={{
              scale: [1, 1.35, 1],
              opacity: [0.35, 0, 0.35],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute -inset-2 rounded-2xl border-2 border-emerald-400/40 pointer-events-none z-0 filter blur-[1px]"
          />
          {/* Inner Golden Emerald Radial Spark */}
          <motion.div
            animate={{
              opacity: [0.15, 0.45, 0.15],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-emerald-500/20 via-yellow-500/10 to-teal-500/20 pointer-events-none z-0 filter blur-sm"
          />
        </>
      )}

      <motion.div 
        animate={isWild && !highlighted ? { scale: [1, 1.08, 1], rotate: [0, 1.5, -1.5, 0] } : { scale: 1 }}
        transition={isWild && !highlighted ? { repeat: Infinity, duration: 2.2, ease: "easeInOut" } : undefined}
        className="text-4xl md:text-5xl lg:text-7xl drop-shadow-md select-none group-hover:scale-110 transition-transform relative z-10"
      >
        {symbol.emoji}
      </motion.div>
      
      {/* Lock/Unlock Tooltip hint */}
      {!highlighted && !isLocked && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-2xl z-20">
          <span className="text-[10px] font-black uppercase text-amber-400">Lock (+5)</span>
        </div>
      )}

      {isLocked && (
        <div className="absolute -top-1 -right-1 bg-amber-400 text-black p-1 rounded-full shadow-lg z-20">
          <Lock className="w-3 h-3" />
        </div>
      )}

      {isWild && !highlighted && !isLocked && (
        <motion.div 
          animate={{ scale: [1, 1.08, 1], boxShadow: ["0px 0px 4px rgba(16,185,129,0.3)", "0px 0px 10px rgba(16,185,129,0.8)", "0px 0px 4px rgba(16,185,129,0.3)"] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="absolute top-1 right-1 z-20"
        >
          <span className="text-[9px] bg-gradient-to-r from-emerald-400 to-teal-500 text-black px-1.5 py-0.5 font-black rounded shadow-md tracking-wider">WILD</span>
        </motion.div>
      )}
    </motion.div>
  );
};

const Reel = ({ 
  symbols, 
  isSpinning: globalIsSpinning, 
  delay, 
  colIdx, 
  lockedPositions, 
  onToggleLock,
  isSymbolWinning,
  isTurbo = false
}: { 
  symbols: Symbol[]; 
  isSpinning: boolean; 
  delay: number; 
  colIdx: number;
  lockedPositions: Set<string>;
  onToggleLock: (col: number, row: number) => void;
  isSymbolWinning: (colIdx: number, rowIdx: number) => boolean;
  isTurbo?: boolean;
  key?: React.Key 
}) => {
  const [localIsSpinning, setLocalIsSpinning] = useState(globalIsSpinning);
  const [displaySymbols, setDisplaySymbols] = useState(symbols);

  useEffect(() => {
    if (globalIsSpinning) {
      setLocalIsSpinning(true);
      const blurSymbols = Array(20).fill(null).map(() => getRandomSymbol());
      setDisplaySymbols([...blurSymbols, ...symbols]);
    } else {
      const timer = setTimeout(() => {
        setLocalIsSpinning(false);
        setDisplaySymbols(symbols);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [globalIsSpinning, symbols, delay]);

  return (
    <div className="relative flex-1 h-[240px] md:h-[360px] lg:h-[480px] overflow-hidden bg-black/60 rounded-2xl border-x border-white/5 mx-0.5">
      {/* High-Speed Speed Streak Lines & Motion Overlay when spinning */}
      {localIsSpinning && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/80 via-black/30 to-transparent z-10" />
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10" />
          
          <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,transparent,transparent_10px,rgba(255,255,255,0.06)_10px,rgba(255,255,255,0.06)_14px)] opacity-75" />
          <motion.div 
            animate={{ opacity: [0.15, 0.45, 0.15] }}
            transition={{ duration: 0.18, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-amber-500/5 to-emerald-500/10" 
          />
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {localIsSpinning ? (
          <motion.div
            key="spinning"
            initial={{ y: 0, scaleY: 1, scaleX: 1 }}
            animate={{ 
              y: [0, 30, -1650],
              scaleY: [1, 1.25, 1.30, 1.15],
              scaleX: [1, 0.92, 0.88, 0.95]
            }}
            transition={{ 
              duration: isTurbo ? 0.65 : 1.8, 
              times: [0, 0.08, 0.7, 1],
              ease: [0.42, 0, 0.58, 1],
              delay: delay / 1000 
            }}
            className="flex flex-col gap-3 p-3"
            style={{ 
              willChange: 'transform',
              filter: 'url(#reel-directional-blur)'
            }}
          >
            {displaySymbols.map((s, i) => (
              <SlotSymbol 
                key={`blur-${i}`} 
                symbol={s} 
                isLocked={lockedPositions.has(`${colIdx}-${(i - 20) % ROWS}`)}
                isSpinning={true}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="stopped"
            initial={{ y: -80, scaleY: 1.22, scaleX: 0.92, opacity: 0.85 }}
            animate={{ 
              y: [ -80, 16, -6, 2, 0 ], 
              scaleY: [ 1.22, 0.88, 1.05, 0.98, 1 ],
              scaleX: [ 0.92, 1.06, 0.97, 1.01, 1 ],
              opacity: 1 
            }}
            transition={{ 
              duration: 0.45,
              ease: "easeOut"
            }}
            className="flex flex-col gap-3 p-3 h-full justify-between"
            style={{ willChange: 'transform, opacity' }}
          >
            {symbols.map((s, i) => (
              <SlotSymbol 
                key={`final-${i}`} 
                symbol={s} 
                highlighted={isSymbolWinning(colIdx, i)}
                isLocked={lockedPositions.has(`${colIdx}-${i}`)}
                onToggleLock={() => onToggleLock(colIdx, i)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  // --- Game State ---
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('safari_slots_balance');
    return saved ? parseFloat(saved) : 1000;
  });
  const [bet, setBet] = useState(() => {
    const saved = localStorage.getItem('safari_slots_bet');
    const b = saved ? parseInt(saved) : 10;
    return Math.max(10, b);
  });
  const [grid, setGrid] = useState(generateGrid());
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [winType, setWinType] = useState<'none' | 'small' | 'big' | 'mega' | 'jackpot'>('none');
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [freeSpins, setFreeSpins] = useState(() => {
    const saved = localStorage.getItem('safari_slots_free_spins');
    return saved ? parseInt(saved) : 0;
  });
  const [totalFreeWin, setTotalFreeWin] = useState(() => {
    const saved = localStorage.getItem('safari_slots_total_free_win');
    return saved ? parseFloat(saved) : 0;
  });
  const [jackpot, setJackpot] = useState(() => {
    const saved = localStorage.getItem('safari_slots_jackpot');
    return saved ? parseFloat(saved) : 12500.50;
  });
  const [showJackpotWin, setShowJackpotWin] = useState(false);
  const [lockedPositions, setLockedPositions] = useState<Set<string>>(new Set());
  const [autoPlay, setAutoPlay] = useState(false);
  const [showAutoPlaySettings, setShowAutoPlaySettings] = useState(false);
  const [autoPlayConfig, setAutoPlayConfig] = useState(() => {
    const saved = localStorage.getItem('safari_slots_autoplay_config');
    return saved ? JSON.parse(saved) : { spins: 10, lossLimit: 0, winLimit: 0 };
  });
  const [sessionWinnings, setSessionWinnings] = useState(() => {
    const saved = localStorage.getItem('safari_slots_session_winnings');
    return saved ? parseFloat(saved) : 0;
  });
  const [activePaylines, setActivePaylines] = useState(() => {
    const saved = localStorage.getItem('safari_slots_active_lines');
    return saved ? parseInt(saved) : 20;
  });
  const [showPaylineDropdown, setShowPaylineDropdown] = useState(false);
  const [wildMultipliers, setWildMultipliers] = useState<Record<number, number>>({});
  const [coins, setCoins] = useState<CoinParticle[]>([]);
  const [winStreak, setWinStreak] = useState(0);
  const [isTurbo, setIsTurbo] = useState(false);

  // --- Persistence Effect ---
  useEffect(() => {
    localStorage.setItem('safari_slots_balance', balance.toString());
    localStorage.setItem('safari_slots_bet', bet.toString());
    localStorage.setItem('safari_slots_free_spins', freeSpins.toString());
    localStorage.setItem('safari_slots_total_free_win', totalFreeWin.toString());
    localStorage.setItem('safari_slots_jackpot', jackpot.toString());
    localStorage.setItem('safari_slots_autoplay_config', JSON.stringify(autoPlayConfig));
    localStorage.setItem('safari_slots_session_winnings', sessionWinnings.toString());
    localStorage.setItem('safari_slots_active_lines', activePaylines.toString());
  }, [balance, bet, freeSpins, totalFreeWin, jackpot, autoPlayConfig, sessionWinnings, activePaylines]);
  const [sessionSpinsLeft, setSessionSpinsLeft] = useState(0);
  const [sessionStartingBalance, setSessionStartingBalance] = useState(0);

  const [muted, setMuted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const triggerCoinBurst = useCallback((amount: number, currentStreak = 0) => {
    const streakBonus = currentStreak >= 2 ? currentStreak * 10 : 0;
    const optimizedAmount = Math.min(amount + streakBonus, 75);
    const newCoins: CoinParticle[] = Array.from({ length: optimizedAmount }).map((_, idx) => ({
      id: Date.now() + idx + Math.random(),
      angle: 190 + Math.random() * 160, // Burst upwards and sideways
      speed: (0.5 + Math.random() * 1.5) * (currentStreak >= 2 ? 1.4 : 1), // Sells the intensity
      delay: Math.random() * 0.4,
      winStreak: currentStreak
    }));
    setCoins(prev => [...prev, ...newCoins].slice(-120));
    
    setTimeout(() => {
      setCoins([]);
    }, 4500);
  }, []);

  const triggerGoldDustConfetti = useCallback(() => {
    const duration = 2.5 * 1000;
    const animationEnd = Date.now() + duration;

    // Center burst of high-velocity golden dust & stars
    confetti({
      particleCount: 160,
      spread: 140,
      startVelocity: 50,
      origin: { x: 0.5, y: 0.4 },
      colors: ['#ffe066', '#ffd700', '#ffb700', '#fff5b8', '#d4af37', '#ffffff', '#eab308'],
      shapes: ['circle', 'square'],
      scalar: 1.25,
      ticks: 280,
      gravity: 0.75,
    });

    // Screen-wide side bursts (left and right) for full viewport coverage
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 75,
      origin: { x: 0, y: 0.5 },
      colors: ['#ffd700', '#ffe066', '#fff5b8', '#ffffff'],
      shapes: ['circle'],
      scalar: 1.1,
      ticks: 240,
    });
    confetti({
      particleCount: 80,
      angle: 120,
      spread: 75,
      origin: { x: 1, y: 0.5 },
      colors: ['#ffd700', '#ffe066', '#fff5b8', '#ffffff'],
      shapes: ['circle'],
      scalar: 1.1,
      ticks: 240,
    });

    // Screen-wide cascading sparkling golden dust shower overlay
    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const countMultiplier = timeLeft / duration;

      // Golden sparkling dust falling across top screen width
      confetti({
        particleCount: Math.max(2, Math.floor(18 * countMultiplier)),
        startVelocity: 8 + Math.random() * 12,
        spread: 80,
        ticks: 220,
        origin: { x: Math.random(), y: -0.05 },
        colors: ['#ffe066', '#ffd700', '#ffb700', '#fff8dc', '#d4af37', '#ffffff'],
        shapes: ['circle'],
        scalar: Math.random() * 0.75 + 0.55,
        drift: (Math.random() - 0.5) * 0.9,
        gravity: 0.6 + Math.random() * 0.35,
        disableForReducedMotion: true,
      });
    }, 80);
  }, []);

  // --- Ambient Sound Effect ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!muted) {
      // Accelerate client loop speed as winStreak grows, creating tension/excitement
      const calculatedInterval = Math.max(900, 3000 - (winStreak * 500));
      interval = setInterval(() => {
        const checkThreshold = Math.max(0.4, 0.7 - (winStreak * 0.08));
        if (Math.random() > checkThreshold) {
          playSound('ambient_safari', muted, winStreak);
        }
      }, calculatedInterval);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [muted, winStreak]);

  // --- Logic ---

  const checkWins = useCallback((currentGrid: Symbol[][]) => {
    let totalWin = 0;
    const lines: number[] = [];
    const multipliers: Record<number, number> = {};

    PAYLINES.slice(0, activePaylines).forEach((line, index) => {
      const firstSymbol = currentGrid[0][line[0]];
      let matches = 1;

      for (let i = 1; i < COLS; i++) {
        const currentSymbol = currentGrid[i][line[i]];
        const targetSymbol = firstSymbol;

        if (
          currentSymbol.id === targetSymbol.id || 
          currentSymbol.type === 'wild' || 
          targetSymbol.type === 'wild'
        ) {
          matches++;
        } else {
          break;
        }
      }

      if (matches >= 3) {
        let valuedSymbol = firstSymbol;
        if (firstSymbol.type === 'wild') {
          for (let i = 0; i < matches; i++) {
            if (currentGrid[i][line[i]].type !== 'wild') {
              valuedSymbol = currentGrid[i][line[i]];
              break;
            }
          }
        }

        // Check if there is any wild symbol in the winning combination on this payline
        let hasWild = false;
        for (let i = 0; i < matches; i++) {
          if (currentGrid[i][line[i]].type === 'wild') {
            hasWild = true;
            break;
          }
        }

        let wildMultiplier = 1;
        if (hasWild) {
          wildMultiplier = Math.random() < 0.5 ? 2 : 3;
        }

        const payoutMultiplier = matches === 3 ? 1 : matches === 4 ? 5 : 20;
        let lineWin = valuedSymbol.value * payoutMultiplier * (bet / 10);
        if (wildMultiplier > 1) {
          lineWin *= wildMultiplier;
          multipliers[index] = wildMultiplier;
        }

        totalWin += lineWin;
        lines.push(index);
      }
    });

    // Check Scatters
    let scatterCount = 0;
    currentGrid.forEach(col => col.forEach(sym => {
      if (sym.type === 'scatter') scatterCount++;
    }));

    if (scatterCount >= 3) {
      setFreeSpins(prev => prev + 10);
    }

    return { totalWin, lines, multipliers };
  }, [bet, activePaylines]);

  const handleSpin = useCallback(() => {
    const lockCost = lockedPositions.size * 5;
    const lineBetMultiplier = activePaylines / 20;
    const totalStake = (bet * lineBetMultiplier) + lockCost;
    
    // Use the latest balance and freeSpins for the check
    if (isSpinning || (balance < totalStake && freeSpins === 0)) {
      setAutoPlay(false);
      return;
    }

    // Capture current state values needed for the setTimeout logic
    const currentLockedSize = lockedPositions.size;
    const currentFreeSpins = freeSpins;
    const currentMuted = muted;
    const currentGridState = grid;
    const currentJackpot = jackpot;

    setIsSpinning(true);
    setWinningLines([]);
    setLastWin(0);
    setWildMultipliers({});
    setCoins([]);
    playSound('spin', currentMuted, winStreak);

    if (currentFreeSpins === 0) {
      setBalance(prev => prev - totalStake);
      setSessionWinnings(prev => prev - totalStake);
      setJackpot(prev => prev + ((totalStake - (currentLockedSize * 5)) * 0.01)); 
      setTotalFreeWin(0);
    }

    const newGrid = Array(COLS).fill(null).map((_, colIdx) => 
      Array(ROWS).fill(null).map((_, rowIdx) => {
        if (lockedPositions.has(`${colIdx}-${rowIdx}`)) {
          return currentGridState[colIdx][rowIdx];
        }
        return getRandomSymbol();
      })
    );

    const completeSpin = () => {
      setGrid(newGrid);
      setIsSpinning(false);
      
      // Symbol-specific landing sounds
      newGrid.forEach((col, colIdx) => {
        setTimeout(() => {
          let soundToPlay: 'land_standard' | 'land_wild' | 'land_scatter' = 'land_standard';
          if (col.some(s => s.type === 'wild')) soundToPlay = 'land_wild';
          else if (col.some(s => s.type === 'scatter')) soundToPlay = 'land_scatter';
          playSound(soundToPlay, currentMuted, winStreak);
        }, colIdx * REEL_DELAY);
      });

      setLockedPositions(new Set()); // Reset locks after spin
      
      const { totalWin, lines, multipliers } = checkWins(newGrid);
      const finalWin = currentFreeSpins > 0 ? totalWin * 3 : totalWin;

      const isWon = finalWin > 0;
      let currentStreak = winStreak;
      if (isWon) {
        currentStreak += 1;
        setWinStreak(currentStreak);
      } else {
        currentStreak = 0;
        setWinStreak(0);
      }

      if (finalWin > 0) {
        setLastWin(finalWin);
        setWinningLines(lines);
        setWildMultipliers(multipliers);
        setBalance(prev => prev + finalWin);
        setSessionWinnings(prev => prev + finalWin);
        if (currentFreeSpins > 0) setTotalFreeWin(prev => prev + finalWin);
        
        // Spawn gold coins based on win level with streak boost
        let coinCount = 15;
        if (finalWin >= totalStake * 20) {
          coinCount = 70;
        } else if (finalWin >= totalStake * 5) {
          coinCount = 35;
        }
        triggerCoinBurst(coinCount, currentStreak);
        
        if (finalWin >= totalStake * 20) {
          setWinType('mega');
          playSound('bigWin', currentMuted, currentStreak);
          triggerGoldDustConfetti();
        } else if (finalWin >= totalStake * 5) {
          setWinType('big');
          playSound('bigWin', currentMuted, currentStreak);
          confetti({
            particleCount: 100, spread: 70, origin: { y: 0.6 },
            colors: ['#fbbf24', '#f59e0b']
          });
        } else {
          setWinType('small');
          playSound('win', currentMuted, currentStreak);
        }
        
        if (autoPlay && autoPlayConfig.winLimit > 0 && finalWin >= autoPlayConfig.winLimit) {
          setAutoPlay(false);
        }
      } else {
        setWinType('none');
        playSound('loss_thud', currentMuted, 0);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 300);
      }

      // Loss Limit Check
      if (autoPlay && autoPlayConfig.lossLimit > 0) {
        const currentLoss = sessionStartingBalance - (balance + finalWin - (currentFreeSpins > 0 ? 0 : totalStake));
        if (currentLoss >= autoPlayConfig.lossLimit) {
          setAutoPlay(false);
        }
      }

      if (autoPlay && sessionSpinsLeft > 0) {
        setSessionSpinsLeft(prev => {
          if (prev <= 1) setAutoPlay(false);
          return prev - 1;
        });
      }

      const isJackpotWin = Math.random() < 0.0005;
      if (isJackpotWin && currentFreeSpins === 0) {
        const jackpotWinAmount = currentJackpot;
        setBalance(prev => prev + jackpotWinAmount);
        setLastWin(jackpotWinAmount);
        setShowJackpotWin(true);
        setJackpot(10000.00); 
        playSound('bigWin', currentMuted, currentStreak);
        triggerGoldDustConfetti();
        triggerCoinBurst(100, currentStreak);
      }

      if (currentFreeSpins > 0) {
        setFreeSpins(prev => prev - 1);
      }
    };

    setTimeout(completeSpin, SPIN_DURATION + (REEL_DELAY * COLS));
  }, [isSpinning, balance, bet, activePaylines, lockedPositions, grid, freeSpins, jackpot, checkWins, muted, autoPlay, autoPlayConfig, sessionStartingBalance, sessionSpinsLeft, triggerCoinBurst, triggerGoldDustConfetti, winStreak]);

  const startAutoPlay = () => {
    setSessionSpinsLeft(autoPlayConfig.spins);
    setSessionStartingBalance(balance);
    setAutoPlay(true);
    setShowAutoPlaySettings(false);
  };

  const toggleLock = (col: number, row: number) => {
    if (isSpinning || freeSpins > 0) return;
    const key = `${col}-${row}`;
    setLockedPositions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (autoPlay && !isSpinning) {
      const timer = setTimeout(handleSpin, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, isSpinning, handleSpin]);

  // --- Render Helpers ---

  const isSymbolWinning = (colIdx: number, rowIdx: number) => {
    return winningLines.some(lineIdx => PAYLINES[lineIdx][colIdx] === rowIdx);
  };

  return (
    <div className={`min-h-screen text-white flex flex-col font-sans overflow-hidden relative transition-colors duration-1000 ease-in-out ${
      freeSpins > 0 
        ? 'bg-[#1b0b02] selection:bg-orange-500/30' 
        : 'bg-[#0d1b1e] selection:bg-emerald-500/30'
    }`}>
      <CoinOverlay coins={coins} />
      {/* Global SVG Filters for Directional Motion Blur & High-Speed Effects */}
      <svg className="absolute w-0 h-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <defs>
          <filter id="reel-directional-blur" x="-30%" y="-150%" width="160%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0 16" />
          </filter>
          <filter id="reel-directional-blur-medium" x="-30%" y="-150%" width="160%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0 8" />
          </filter>
        </defs>
      </svg>
      {/* Background with Theme Overlay */}
      <div className={`fixed inset-0 pointer-events-none transition-colors duration-1000 ease-in-out ${
        freeSpins > 0 ? 'bg-[#1b0b02]' : 'bg-[#0d1b1e]'
      }`}>
        <div className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
          freeSpins > 0 ? 'opacity-0' : 'opacity-100'
        } bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.15)_0%,_transparent_70%)]`} />
        <div className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
          freeSpins > 0 ? 'opacity-100' : 'opacity-0'
        } bg-[radial-gradient(circle_at_center,_rgba(249,115,22,0.18)_0%,_transparent_70%)]`} />
      </div>

      {/* Header */}
      <header className="relative z-10 h-20 flex items-center justify-between px-6 md:px-10 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)] flex items-center justify-center border-2 border-emerald-300">
            <span className="text-2xl">🐾</span>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic text-emerald-400 leading-none">Wild Kingdom</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/50 mt-1">Premium Safari Slots</p>
          </div>
        </div>

        {/* Grand Jackpot Display */}
        <div className="absolute left-1/2 -translate-x-1/2 top-4 hidden lg:block">
          <motion.div 
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="px-8 py-2 bg-gradient-to-br from-neutral-900 to-black rounded-lg border-2 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)] text-center relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent shadow-[0_0_10px_#fbbf24]" />
            <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest leading-none mb-1 shadow-sm">Grand Jackpot</p>
            <p className="text-2xl font-mono font-black text-white tabular-nums">
              ${jackpot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex gap-4 md:gap-6 items-center">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Session Net</span>
              <span className={`text-xl font-mono font-black tabular-nums ${sessionWinnings >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                {sessionWinnings >= 0 ? '+' : '-'}${Math.abs(sessionWinnings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="hidden sm:block h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-end bg-gradient-to-br from-yellow-500/10 to-transparent px-3 md:px-4 py-1.5 rounded-xl border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
              <span className="text-[9px] font-black text-yellow-200 uppercase tracking-[0.2em] mb-0.5 md:mb-1">Total Balance</span>
              <motion.span 
                key={balance}
                initial={{ scale: 1.1, color: '#fef08a' }}
                animate={{ scale: 1, color: '#fef9c3' }}
                className="text-lg md:text-2xl font-mono font-black tabular-nums drop-shadow-[0_0_10px_rgba(253,224,71,0.3)]"
              >
                ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </motion.span>
            </div>
          </div>
          <div className="flex gap-1 md:gap-2">
            <button 
              onClick={() => setMuted(!muted)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/10"
            >
              {muted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/10"
            >
              <Info className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 max-w-7xl mx-auto w-full">
        
        {/* Bonus Mode Indicator */}
        <AnimatePresence>
          {freeSpins > 0 && (
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="absolute right-8 top-0 bg-yellow-500/10 border border-yellow-500/50 rounded-xl p-4 w-48 text-center shadow-[0_0_30px_rgba(234,179,8,0.1)] hidden lg:block"
            >
              <p className="text-yellow-500 font-bold uppercase text-sm tracking-tighter italic">Bonus Mode</p>
              <p className="text-4xl font-black text-white">{freeSpins}</p>
              <p className="text-[10px] text-yellow-200/70 uppercase tracking-widest">Free Spins Left</p>
              <p className="text-xl font-bold text-yellow-300 mt-2">${totalFreeWin.toLocaleString()}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Win Streak Indicator */}
        <AnimatePresence>
          {winStreak >= 2 && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0, y: 15 }}
              animate={{ 
                scale: [0.9, 1.15, 1], 
                opacity: 1, 
                y: 0 
              }}
              exit={{ scale: 0.8, opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="mb-6 flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-orange-600/90 via-red-650/95 to-yellow-500/90 border border-orange-400/50 shadow-[0_0_25px_rgba(249,115,22,0.6)]"
            >
              <span className="text-xl animate-bounce">🔥</span>
              <span className="font-sans font-black tracking-wider text-xs md:text-sm text-yellow-100 uppercase italic">
                {winStreak} Win Streak!
              </span>
              <span className="font-sans text-[10px] font-black tracking-widest text-white/90 bg-black/40 px-2 py-0.5 rounded-full uppercase ml-1 animate-pulse">
                {winStreak >= 4 ? 'MAX EXCITEMENT!' : 'BOOSTED TONES!'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Machine */}
        <motion.div 
          animate={isShaking ? {
            x: [0, -5, 5, -5, 5, 0],
            y: [0, 2, -2, 2, -2, 0]
          } : {}}
          transition={{ duration: 0.25 }}
          className="relative p-2 md:p-4 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border-4 border-neutral-700/50"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 via-yellow-500 to-emerald-500 opacity-20 blur-xl"></div>
          
          <div className="grid grid-cols-5 gap-1 md:gap-3 relative">
            <PaylineOverlay winningLines={winningLines} isSpinning={isSpinning} wildMultipliers={wildMultipliers} />
            {grid.map((col, i) => (
              <Reel 
                key={`reel-${i}`} 
                symbols={col} 
                isSpinning={isSpinning} 
                delay={i * REEL_DELAY} 
                colIdx={i}
                lockedPositions={lockedPositions}
                onToggleLock={toggleLock}
                isSymbolWinning={isSymbolWinning}
              />
            ))}
          </div>

          {/* Payline Indicators (Visual Decor) */}
          <div className="absolute left-[-15px] md:left-[-25px] top-1/2 -translate-y-1/2 flex flex-col gap-6 md:gap-10 pointer-events-none">
            <div className="w-3 md:w-5 h-3 md:h-5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
            <div className="w-3 md:w-5 h-3 md:h-5 rounded-full bg-red-500/30"></div>
            <div className="w-3 md:w-5 h-3 md:h-5 rounded-full bg-blue-500/30"></div>
          </div>
        </motion.div>

        {/* Ways to Win Banner */}
        <div className="mt-8 px-8 md:px-12 py-3 bg-white/5 rounded-full backdrop-blur-md border border-white/10 flex gap-4 md:gap-6 text-xs md:text-sm uppercase tracking-widest font-bold">
          <span className="text-emerald-400">{activePaylines} Paylines Active</span>
          <span className="text-white/20">|</span>
          <span className="text-yellow-400">Bonus x3 Multiplier</span>
        </div>
      </main>

      {/* Mobile Info Bar (Sticky above footer) */}
      <div className="md:hidden fixed bottom-32 left-0 right-0 px-4 pointer-events-none z-40">
        <div className="flex justify-between items-end gap-2">
          <motion.div 
            animate={lastWin > 0 ? { y: [0, -10, 0], scale: [1, 1.05, 1] } : {}}
            className="bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-yellow-500/30 flex-1"
          >
            <p className="text-[8px] uppercase tracking-widest text-white/40">Last Win</p>
            <p className="text-sm font-mono font-black text-yellow-400 tabular-nums">
              ${lastWin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </motion.div>
          
          <div className="bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-yellow-500/30 text-right flex-1">
            <p className="text-[8px] uppercase tracking-widest text-yellow-200/40">Total Balance</p>
            <p className="text-sm font-mono font-black text-white tabular-nums">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <footer className="relative z-10 h-32 bg-black/60 backdrop-blur-xl border-t border-white/5 px-6 md:px-10 flex items-center justify-between">
        <div className="flex gap-4 md:gap-10 items-center">
          <div className="flex flex-col">
            <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold">Bet</label>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setBet(b => Math.max(10, b - 10))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-20"
              >
                -
              </button>
              <span className="text-xl font-mono font-bold min-w-[60px] text-center">${bet}</span>
              <button 
                onClick={() => setBet(b => Math.min(500, b + 10))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-20"
              >
                +
              </button>
              <button 
                onClick={() => setBet(500)}
                disabled={isSpinning}
                className={`px-2 h-8 rounded-lg border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-black tracking-tighter hover:bg-emerald-500/20 transition-all ${bet === 500 ? 'bg-emerald-500 text-black border-emerald-500' : ''}`}
              >
                MAX
              </button>
            </div>
          </div>

          <div className="flex flex-col relative">
            <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold">Lines</label>
            <button
              onClick={() => !isSpinning && setShowPaylineDropdown(!showPaylineDropdown)}
              disabled={isSpinning}
              className={`h-8 px-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between gap-3 text-xs font-black transition-all hover:bg-white/10 disabled:opacity-50 min-w-[80px] ${
                showPaylineDropdown ? 'border-blue-500/50 ring-2 ring-blue-500/20' : ''
              }`}
            >
              <span className="text-white">{activePaylines}</span>
              <ChevronDown className={`w-3 h-3 text-white/40 transition-transform duration-300 ${showPaylineDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showPaylineDropdown && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowPaylineDropdown(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: -4, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 mb-2 w-full bg-[#1a1a1c] border border-white/10 rounded-xl shadow-2xl p-1 z-50 overflow-hidden"
                  >
                    {[5, 10, 15, 20].map(l => (
                      <button
                        key={`line-opt-${l}`}
                        onClick={() => {
                          setActivePaylines(l);
                          setShowPaylineDropdown(false);
                        }}
                        className={`w-full px-4 py-2 rounded-lg text-left text-xs font-bold transition-all flex items-center justify-between group ${
                          activePaylines === l 
                            ? 'bg-blue-500 text-white' 
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {l} Lines
                        {activePaylines === l && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex flex-col border-l border-white/10 pl-6">
            <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold">Total Bet</label>
            <span className="text-xl font-mono font-bold text-emerald-400 font-black">${(bet * (activePaylines / 20)) + (lockedPositions.size * 5)}</span>
          </div>
          
          <div className="hidden md:flex flex-col">
            <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold">Auto Play</label>
            <button 
              onClick={() => {
                if (autoPlay) setAutoPlay(false);
                else setShowAutoPlaySettings(true);
              }}
              className={`h-8 px-4 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                autoPlay 
                  ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                  : 'bg-white/10 hover:bg-white/20 text-white/70'
              }`}
            >
              {autoPlay ? (
                <>
                  <RotateCcw className="w-3 h-3 animate-spin" />
                  {sessionSpinsLeft} LEFT
                </>
              ) : 'OFF'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="h-20 w-20 rounded-full border-4 border-emerald-500/30 flex items-center justify-center relative">
            <button
              onClick={handleSpin}
              disabled={isSpinning || (balance < (bet * (activePaylines / 20)) && freeSpins === 0)}
              className={`
                h-16 w-16 rounded-full flex items-center justify-center transition-all relative overflow-hidden group
                ${(isSpinning || (balance < (bet * (activePaylines / 20)) && freeSpins === 0))
                  ? 'bg-emerald-900/50 text-white/30 cursor-not-allowed'
                  : 'bg-gradient-to-tr from-emerald-600 to-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-90 scale-100 hover:scale-105'
                }
              `}
            >
              {isSpinning ? (
                <RotateCcw className="w-6 h-6 animate-spin text-black" />
              ) : (
                <span className="font-black italic text-lg text-black">SPIN</span>
              )}
            </button>
          </div>
          {/* Debug buttons moved/removed for better UX */}
        </div>

        <div className="flex gap-2">
            <div className="hidden md:flex flex-col text-right mr-4">
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{activePaylines} Lines</p>
              <p className="text-xs font-bold text-emerald-400">PAYLINE MODE</p>
            </div>
        </div>
      </footer>

      {/* Win Overlays */}
      <AnimatePresence>
        {winType !== 'none' && !isSpinning && !showJackpotWin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center z-40 bg-black/20"
          >
            {winType === 'small' && (
              <motion.div 
                initial={{ scale: 0.5, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-black/60 backdrop-blur-md px-8 py-3 rounded-2xl border border-white/20 shadow-xl flex flex-col items-center"
              >
                <p className="text-white text-xs font-black uppercase tracking-widest text-center mb-1">Nice Win!</p>
                <p className="text-2xl font-black text-emerald-400 italic text-center">+${lastWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {(Object.values(wildMultipliers) as number[]).some(m => m > 1) && (
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider text-center mt-1">
                    Includes {Math.max(...(Object.values(wildMultipliers) as number[]))}x WILD multiplier!
                  </p>
                )}
              </motion.div>
            )}

            {winType === 'big' && (
              <motion.div 
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                className="bg-gradient-to-br from-yellow-400 to-orange-600 p-8 rounded-3xl shadow-[0_0_50px_rgba(251,191,36,0.5)] border-4 border-white flex flex-col items-center"
              >
                <p className="text-sm font-black text-white text-center uppercase tracking-[0.3em] drop-shadow-md mb-2">Big Win!</p>
                <motion.p 
                  animate={{ scale: [1, 1.1, 1] }} 
                  transition={{ repeat: Infinity, duration: 0.4 }}
                  className="text-5xl md:text-7xl font-black text-white drop-shadow-xl tabular-nums italic text-center"
                >
                  ${lastWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </motion.p>
                {(Object.values(wildMultipliers) as number[]).some(m => m > 1) && (
                  <p className="text-xs text-yellow-100 font-black uppercase tracking-widest text-center mt-2 drop-shadow">
                    ★ {Math.max(...(Object.values(wildMultipliers) as number[]))}x WILD MULTIPLIER ACTIVE ★
                  </p>
                )}
              </motion.div>
            )}

            {winType === 'mega' && (
              <motion.div 
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1.1, rotate: 0 }}
                className="flex flex-col items-center gap-4 bg-black/40 backdrop-blur-xl p-12 rounded-[3rem] border-2 border-emerald-500/50 shadow-[0_0_100px_rgba(16,185,129,0.3)]"
              >
                <div className="relative">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-400/40 to-emerald-500/0 rounded-full blur-3xl"
                  />
                  <Trophy className="w-24 h-24 text-yellow-400 fill-yellow-400 relative z-10 filter drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                </div>
                <div className="text-center flex flex-col items-center">
                  <h3 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 italic uppercase tracking-tighter drop-shadow-[0_0_30px_rgba(16,185,129,0.5)] mb-2">MEGA WIN</h3>
                  <motion.p 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 0.3, repeat: Infinity }}
                    className="text-6xl md:text-8xl font-black text-white italic drop-shadow-lg tabular-nums text-center"
                  >
                    ${lastWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </motion.p>
                  {(Object.values(wildMultipliers) as number[]).some(m => m > 1) && (
                    <motion.p 
                      animate={{ scale: [0.95, 1.05, 0.95] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-emerald-400 font-black tracking-widest text-xs md:text-sm uppercase mt-4 text-center filter drop-shadow-[0_0_10px_#10b981]"
                    >
                      🚀 MULTIPLIED BY {Math.max(...(Object.values(wildMultipliers) as number[]))}x WILD!
                    </motion.p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jackpot Win Modal */}
      <AnimatePresence>
        {showJackpotWin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setShowJackpotWin(false)}
          >
            <motion.div 
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600 p-1 rounded-[3rem] shadow-[0_0_100px_rgba(234,179,8,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#1a1a1c] p-12 rounded-[2.8rem] flex flex-col items-center text-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="text-8xl mb-6"
                >
                  🏆
                </motion.div>
                <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 italic mb-2">GRAND JACKPOT!</h2>
                <p className="text-white/60 uppercase tracking-[0.3em] font-bold mb-8">Ultimate Safari Legend</p>
                
                <p className="text-7xl font-mono font-black text-white mb-10 tabular-nums">
                  ${lastWin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>

                <button 
                  onClick={() => setShowJackpotWin(false)}
                  className="w-full py-6 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-black text-xl uppercase rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl"
                >
                  Claim My Prize
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto Play Settings Modal */}
      <AnimatePresence>
        {showAutoPlaySettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowAutoPlaySettings(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1a1a1c] border border-white/10 p-8 rounded-[2rem] max-w-md w-full shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-2xl font-black mb-6 text-emerald-400 italic">AUTO PLAY SETTINGS</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold block mb-3">Number of Spins</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 25, 50, 100].map(s => (
                      <button
                        key={`spins-${s}`}
                        onClick={() => setAutoPlayConfig(prev => ({ ...prev, spins: s }))}
                        className={`py-2 rounded-xl text-xs font-black transition-all border ${
                          autoPlayConfig.spins === s 
                            ? 'bg-emerald-500 border-emerald-400 text-black' 
                            : 'bg-white/5 border-white/10 text-white/60'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold block mb-3">Stop if Loss exceeds</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 100, 500, 1000].map(l => (
                      <button
                        key={`loss-${l}`}
                        onClick={() => setAutoPlayConfig(prev => ({ ...prev, lossLimit: l }))}
                        className={`py-2 rounded-xl text-xs font-black transition-all border ${
                          autoPlayConfig.lossLimit === l 
                            ? 'bg-emerald-500 border-emerald-400 text-black' 
                            : 'bg-white/5 border-white/10 text-white/60'
                        }`}
                      >
                        {l === 0 ? 'NEVER' : `$${l}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold block mb-3">Stop if Single Win exceeds</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 100, 500, 1000].map(w => (
                      <button
                        key={`win-lim-${w}`}
                        onClick={() => setAutoPlayConfig(prev => ({ ...prev, winLimit: w }))}
                        className={`py-2 rounded-xl text-xs font-black transition-all border ${
                          autoPlayConfig.winLimit === w 
                            ? 'bg-emerald-500 border-emerald-400 text-black' 
                            : 'bg-white/5 border-white/10 text-white/60'
                        }`}
                      >
                        {w === 0 ? 'NEVER' : `$${w}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={() => setShowAutoPlaySettings(false)}
                  className="py-4 bg-white/5 hover:bg-white/10 text-white/70 font-bold uppercase rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={startAutoPlay}
                  className="py-4 bg-emerald-500 text-black font-black uppercase rounded-2xl transition-all hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                >
                  Start Auto
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1a1a1c] border border-white/10 p-8 rounded-[2rem] max-w-2xl w-full shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-3xl font-black mb-6 text-emerald-400 italic">PAYTABLE & RULES</h2>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {SYMBOLS.map(s => {
                  const prob = (1 / SYMBOLS.length) * 100;
                  return (
                    <div key={s.id} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2 relative group overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] font-mono text-emerald-400/60">{prob.toFixed(1)}%</span>
                      </div>
                      <span className="text-4xl">{s.emoji}</span>
                      <p className="text-[10px] font-bold text-white/40 uppercase">{s.label}</p>
                      <div className="w-full space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-white/40">5x</span>
                          <span className="text-emerald-400 font-bold">x{s.value * 20}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-white/40">4x</span>
                          <span className="text-emerald-400/80">x{s.value * 5}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-white/40">3x</span>
                          <span className="text-emerald-400/60">x{s.value * 1}</span>
                        </div>
                      </div>
                      {s.type === 'wild' && <p className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded w-full text-center">WILD</p>}
                      {s.type === 'scatter' && <p className="text-[9px] bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded w-full text-center">SCATTER</p>}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-4 text-sm text-white/70">
                  <h3 className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2">Game Mechanics</h3>
                  <div className="flex gap-4">
                    <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
                    <p><span className="text-white font-bold">BONUS ROUND:</span> 3+ PAW symbols trigger 10 FREE SPINS. Wins are <span className="text-yellow-400 font-bold">3X TRIPLED</span>!</p>
                  </div>
                  <div className="flex gap-4">
                    <Play className="w-5 h-5 text-emerald-500 shrink-0" />
                    <p><span className="text-white font-bold">WILD:</span> LION substitutes for symbols (except Scatter).</p>
                  </div>
                </div>

                <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                  <h3 className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2">Hit Probabilities (per check)</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Any 3-of-a-kind', odds: '1 in 585' },
                      { label: 'Any 4-of-a-kind', odds: '1 in 4,681' },
                      { label: 'Any 5-of-a-kind', odds: '1 in 32,768' },
                      { label: 'Grand Jackpot', odds: '1 in 2,000 spins' },
                    ].map(stat => (
                      <div key={stat.label} className="flex justify-between items-center text-xs font-mono">
                        <span className="text-white/40">{stat.label}</span>
                        <span className="text-white font-bold">{stat.odds}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowInfo(false)}
                className="mt-8 w-full py-4 bg-emerald-500 text-black font-black uppercase rounded-2xl transition-all hover:bg-emerald-400"
              >
                Return to Safari
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
