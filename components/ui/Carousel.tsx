import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
  images: string[];
  className?: string;
}

const Carousel: React.FC<CarouselProps> = ({ images, className = '' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`relative group overflow-hidden rounded-xl border border-border bg-white shadow-2xl ${className}`}>
      <div 
        className="flex transition-transform duration-700 ease-in-out h-[400px] md:h-[500px]"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {images.map((img, i) => (
          <div key={i} className="min-w-full h-full flex items-center justify-center bg-gray-50">
            <img 
              src={img} 
              alt={`Template screenshot ${i + 1}`} 
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback if images don't exist yet
                (e.target as HTMLImageElement).src = `https://placehold.co/800x600/f4f4f5/71717a?text=Template+${i + 1}`;
              }}
            />
          </div>
        ))}
      </div>

      {/* Controls */}
      <button 
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 backdrop-blur border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronLeft size={20} />
      </button>
      <button 
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 backdrop-blur border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-all ${currentIndex === i ? 'bg-foreground w-4' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`}
          />
        ))}
      </div>
    </div>
  );
};

export default Carousel;