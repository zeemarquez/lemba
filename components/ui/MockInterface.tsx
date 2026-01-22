import React, { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import Button from './Button';

interface MockInterfaceProps {
  mode?: 'editor' | 'templates' | 'split';
  className?: string;
}

const MockInterface: React.FC<MockInterfaceProps> = ({ mode, className = '' }) => {
  const [isLoading, setIsLoading] = useState(true);
  
  // Base URL of the live app
  const baseUrl = "https://app.markdown-app.com/";
  
  // Optional: Map modes to specific routes/hashes if the app supports them
  // For now, we'll point to the main app, but we can differentiate if needed.
  const appUrl = mode ? `${baseUrl}#${mode}` : baseUrl;

  return (
    <div className={`rounded-xl border border-border bg-white shadow-2xl overflow-hidden flex flex-col group ${className}`}>
      {/* Window Title Bar */}
      <div className="h-10 bg-white border-b border-border flex items-center px-4 justify-between shrink-0 z-20">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
          <div className="w-3 h-3 rounded-full bg-green-400"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
            </span>
            Live Preview
          </div>
        </div>
        <div className="flex items-center">
          <a 
            href={baseUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Open app in new tab"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Embedded App Area */}
      <div className="relative flex-1 overflow-hidden h-[600px] bg-[#fafafa]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Connecting to app.markdown-app.com...</p>
          </div>
        )}
        
        <iframe
          src={appUrl}
          className={`w-full h-full border-none transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          title="Modern Markdown Editor Preview"
          onLoad={() => setIsLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />

        {/* Interaction Overlay (Optional: only shows on hover for non-hero sections to prevent accidental scrolling) */}
        {mode && isLoading === false && (
          <div className="absolute inset-0 bg-black/0 pointer-events-none group-hover:bg-black/5 transition-colors duration-300">
             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/90 backdrop-blur border border-border px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm">
                   Click to interact with the live editor
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MockInterface;