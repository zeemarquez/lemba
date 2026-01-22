import React from 'react';
import Button from './ui/Button';
import MockInterface from './ui/MockInterface';
import { Download, ArrowRight } from 'lucide-react';

const Hero: React.FC = () => {
  return (
    <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted border border-border mb-6">
            <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
            <span className="text-xs font-medium text-muted-foreground">v2.0 is now available offline</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
            Focus on writing. <br className="hidden md:block" />
            <span className="text-muted-foreground">We handle the rest.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
            A minimalist, state-of-the-art Markdown editor designed for speed and beauty. 
            Real-time PDF rendering, custom templates, and fully local privacy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto gap-2">
              <Download size={18} />
              Download for Free
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 group">
              View Documentation
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* Mockup Container */}
        <div className="relative mt-12 mx-auto max-w-5xl">
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur-3xl opacity-20"></div>
          <MockInterface className="relative z-10" />
        </div>
      </div>
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-100 blur-3xl opacity-50"></div>
        <div className="absolute top-[40%] -left-[10%] w-[40%] h-[40%] rounded-full bg-purple-100 blur-3xl opacity-50"></div>
      </div>
    </section>
  );
};

export default Hero;