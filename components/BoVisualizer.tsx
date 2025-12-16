import React, { useEffect, useRef } from 'react';
import { Particle } from '../types';

interface BoVisualizerProps {
  particles: Particle[];
  setParticles: React.Dispatch<React.SetStateAction<Particle[]>>;
}

const BoVisualizer: React.FC<BoVisualizerProps> = ({ particles, setParticles }) => {
  const requestRef = useRef<number>();
  const canvasRef = useRef<HTMLDivElement>(null);

  const updateParticles = () => {
    setParticles(prevParticles => {
      if (prevParticles.length === 0) return prevParticles;

      return prevParticles
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.5, // Gravity
          rotation: p.rotation + p.vRotation,
          life: p.life - p.decay,
        }))
        .filter(p => p.life > 0);
    });

    requestRef.current = requestAnimationFrame(updateParticles);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateParticles);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none overflow-hidden z-10"
    >
      {particles.map(p => (
        <div
          key={p.id}
          className={`absolute font-black leading-none select-none ${p.color}`}
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            fontSize: `${p.scale}rem`,
            opacity: p.life,
            transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            textShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}
        >
          {p.text}
        </div>
      ))}
    </div>
  );
};

export default BoVisualizer;
