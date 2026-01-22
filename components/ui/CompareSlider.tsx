import React, { useState, useRef, useCallback } from 'react';

interface CompareSliderProps {
  leftImage: string;
  rightImage: string;
  className?: string;
}

const CompareSlider: React.FC<CompareSliderProps> = ({ leftImage, rightImage, className = '' }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl border border-border bg-white shadow-2xl h-[400px] md:h-[500px] cursor-col-resize select-none ${className}`}
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
    >
      {/* Right Image (Foreground) */}
      <div className="absolute inset-0">
        <img 
          src={rightImage} 
          alt="Visual Mode" 
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/800x600/f4f4f5/71717a?text=Visual+Mode`;
          }}
        />
      </div>

      {/* Left Image (Background clipped) */}
      <div 
        className="absolute inset-0 z-10 border-r-2 border-white shadow-xl" 
        style={{ width: `${sliderPos}%` }}
      >
        <img 
          src={leftImage} 
          alt="Raw Mode" 
          className="absolute inset-0 w-full h-full object-cover max-w-none"
          style={{ width: containerRef.current?.offsetWidth }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/800x600/09090b/ffffff?text=Raw+Markdown`;
          }}
        />
      </div>

      {/* Slider Handle */}
      <div 
        className="absolute inset-y-0 z-20 w-1 bg-white shadow-lg pointer-events-none"
        style={{ left: `${sliderPos}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-border shadow-xl flex items-center justify-center">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-3 bg-muted-foreground rounded-full"></div>
            <div className="w-0.5 h-3 bg-muted-foreground rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-4 left-4 z-30 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] font-bold text-white uppercase tracking-wider">
        Raw Syntax
      </div>
      <div className="absolute bottom-4 right-4 z-30 px-2 py-1 bg-white/80 backdrop-blur rounded text-[10px] font-bold text-foreground uppercase tracking-wider border border-border shadow-sm">
        Visual WYSIWYG
      </div>
    </div>
  );
};

export default CompareSlider;