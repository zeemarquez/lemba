import React from 'react';
import { Edit3, Eye, LayoutTemplate, FileJson, WifiOff, FileOutput } from 'lucide-react';

const features = [
  {
    icon: <Edit3 className="w-6 h-6" />,
    title: "Raw & Visual Editing",
    description: "Switch seamlessly between a distraction-free raw markdown editor and a rich visual WYSIWYG experience."
  },
  {
    icon: <LayoutTemplate className="w-6 h-6" />,
    title: "Custom Templates",
    description: "Design your documents with powerful templating. Control typography, spacing, and layout with ease."
  },
  {
    icon: <FileOutput className="w-6 h-6" />,
    title: "Real-time PDF",
    description: "See your changes instantly. Our lightning-fast engine renders production-ready PDFs as you type."
  },
  {
    icon: <FileJson className="w-6 h-6" />,
    title: "Document Variables",
    description: "Reuse content with document variables. Update a value once, and it updates everywhere in your doc."
  },
  {
    icon: <WifiOff className="w-6 h-6" />,
    title: "100% Offline",
    description: "Your data stays on your device. No cloud syncing required, ensuring total privacy and reliability."
  },
  {
    icon: <Eye className="w-6 h-6" />,
    title: "Live Preview",
    description: "Keep track of the final output with a synchronized side-by-side preview pane."
  }
];

const Features: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-muted/30 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
            Everything you need to write better.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Packed with powerful features yet simple enough for beginners. 
            Designed to get out of your way.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="p-8 bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow group">
              <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-foreground mb-6 group-hover:scale-110 transition-transform duration-300 border border-border">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;