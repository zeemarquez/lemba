import React from 'react';
import { PenTool, Github } from 'lucide-react';
import Button from './ui/Button';

const Navbar: React.FC = () => {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-foreground text-background p-1.5 rounded-lg">
              <PenTool size={20} />
            </div>
            <span className="font-bold text-lg tracking-tight">Modern Markdown</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#templates" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Templates</a>
            <a href="#showcase" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Showcase</a>
          </div>

          <div className="flex items-center gap-4">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hidden sm:block">
              <Github size={20} />
            </a>
            <Button size="sm">Download Now</Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;