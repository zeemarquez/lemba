import React from 'react';
import { PenTool, Twitter, Github, Linkedin } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-border pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
               <div className="bg-foreground text-background p-1.5 rounded-lg">
                 <PenTool size={18} />
               </div>
               <span className="font-bold text-lg tracking-tight">Modern Markdown</span>
            </div>
            <p className="text-muted-foreground max-w-sm">
              The last markdown editor you'll ever need. Built for performance, privacy, and beautiful typography.
            </p>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-bold text-foreground">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Download</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Changelog</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Themes</a></li>
            </ul>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-bold text-foreground">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">License</a></li>
            </ul>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Modern Markdown Editor. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors"><Twitter size={20} /></a>
            <a href="#" className="hover:text-foreground transition-colors"><Github size={20} /></a>
            <a href="#" className="hover:text-foreground transition-colors"><Linkedin size={20} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;