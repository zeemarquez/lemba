"use client";

import { useStore } from "@/lib/store";
import { Layout, Maximize, Type as TypeIcon, ArrowUpFromLine, ArrowDownToLine, CodeIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HeaderFooterPlateEditor } from "@/components/plate-editor/header-footer-plate-editor";

export function TemplateEditor() {
    const { activeTemplateId, templates, updateTemplate, setActiveTemplateCss, closeTab } = useStore();
    const template = templates.find(t => t.id === activeTemplateId);

    const [settings, setSettings] = useState(template?.settings);

    useEffect(() => {
        if (template?.settings) {
            setSettings(template.settings);
        }
    }, [activeTemplateId, template]);

    if (!template || !settings) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5">
                <Layout className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-sm font-medium opacity-50">Select a template to design</p>
            </div>
        );
    }

    // Generate CSS for browser print functionality
    // The PDF export API generates its own CSS from settings directly
    // This CSS is only used for browser print (Ctrl+P)
    const generateCss = (s: typeof settings) => {
        const margins = s.margins || { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };
        const headerMargins = s.header?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
        const footerMargins = s.footer?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
        
        // Check for page number offset
        const headerMatch = s.header?.content?.match(/"offset":\s*(\d+)/);
        const footerMatch = s.footer?.content?.match(/"offset":\s*(\d+)/);
        const offset = headerMatch ? parseInt(headerMatch[1]) : (footerMatch ? parseInt(footerMatch[1]) : 0);

        return `
            @page { 
                size: ${s.pageLayout === 'horizontal' ? 'landscape' : 'portrait'};
                margin: 0;
            }
            *, *::before, *::after {
                box-sizing: border-box;
            }
            body { 
                font-family: ${s.fontFamily};
                font-size: ${s.fontSize};
                color: ${s.textColor};
                background-color: ${s.backgroundColor}; 
                margin: 0;
                padding: 0;
            }
            .page-container {
                width: 100%;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                padding-top: ${margins.top};
                padding-right: ${margins.right};
                padding-bottom: ${margins.bottom};
                padding-left: ${margins.left};
                box-sizing: border-box;
                ${offset > 0 ? `counter-reset: page ${offset};` : ''}
            }
            .prose { 
                font-family: ${s.fontFamily}; 
                font-size: ${s.fontSize}; 
                color: ${s.textColor};
                max-width: 100%;
                line-height: 1.6;
                flex: 1;
            }
            .page-header, .page-footer {
                flex-shrink: 0;
                width: 100%;
            }
            .page-header {
                padding-top: ${headerMargins.top};
                padding-right: ${headerMargins.right};
                padding-bottom: ${headerMargins.bottom};
                padding-left: ${headerMargins.left};
                margin-bottom: 10px;
            }
            .page-footer {
                padding-top: ${footerMargins.top};
                padding-right: ${footerMargins.right};
                padding-bottom: ${footerMargins.bottom};
                padding-left: ${footerMargins.left};
                margin-top: 10px;
            }
            .page-header p, .page-footer p {
                margin: 0;
            }
            .page-header h1, .page-header h2, .page-header h3,
            .page-footer h1, .page-footer h2, .page-footer h3 {
                margin: 0;
            }
            .page-header table, .page-footer table {
                border-collapse: collapse;
                width: 100%;
            }
            .page-header th, .page-footer th,
            .page-header td, .page-footer td {
                padding: 8px;
                text-align: left;
            }
            .page-header th, .page-footer th {
                background-color: #f4f4f4;
            }
            .page-number-placeholder::after {
                content: counter(page, decimal);
            }
            .page-number-placeholder[data-format="lower-roman"]::after { content: counter(page, lower-roman); }
            .page-number-placeholder[data-format="upper-roman"]::after { content: counter(page, upper-roman); }
            .page-number-placeholder[data-format="lower-alpha"]::after { content: counter(page, lower-alpha); }
            .page-number-placeholder[data-format="upper-alpha"]::after { content: counter(page, upper-alpha); }
            ${s.watermark ? `
            body::before {
                content: '${s.watermark}';
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 5rem;
                color: rgba(0,0,0,0.05);
                pointer-events: none;
                white-space: nowrap;
                z-index: 9999;
            }
            ` : ''}
            .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                font-weight: 600;
            }
            .prose h1 { 
                font-size: ${s.h1.fontSize}; 
                color: ${s.h1.color}; 
                text-align: ${s.h1.textAlign};
                border-bottom: ${s.h1.borderBottom ? '1px solid ' + s.h1.color : 'none'};
                text-transform: ${s.h1.textTransform};
                font-weight: 700;
            }
            .prose h2 { 
                font-size: ${s.h2.fontSize}; 
                color: ${s.h2.color}; 
                text-align: ${s.h2.textAlign};
                border-bottom: ${s.h2.borderBottom ? '1px solid ' + s.h2.color : 'none'};
                text-transform: ${s.h2.textTransform};
                font-weight: 600;
            }
            .prose h3 { font-size: 1.5em; }
            .prose p { margin: 1em 0; }
            .prose code {
                background: #f4f4f4;
                padding: 0.2em 0.4em;
                border-radius: 3px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.9em;
            }
            .prose pre {
                background: #f4f4f4;
                padding: 1em;
                border-radius: 5px;
                overflow-x: auto;
            }
            .prose pre code {
                background: none;
                padding: 0;
            }
            .prose blockquote {
                border-left: 4px solid #ddd;
                margin: 1em 0;
                padding-left: 1em;
                color: #666;
            }
            .prose ul, .prose ol {
                margin: 1em 0;
                padding-left: 2em;
            }
            .prose li { margin: 0.5em 0; }
            .prose hr {
                border: none;
                border-top: 1px solid #ddd;
                margin: 2em 0;
            }
            .prose a {
                color: #0066cc;
                text-decoration: none;
            }
        `;
    };

    const updateSetting = (path: string, value: any) => {
        setSettings(prev => {
            if (!prev) return prev;
            const newSettings = { ...prev };
            const keys = path.split('.');
            let current: any = newSettings;
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = { ...current[keys[i]] };
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newSettings;
        });
    };

    // Autosave: sync settings to store when they change
    useEffect(() => {
        if (!settings || !template) return;
        const css = generateCss(settings);
        updateTemplate(template.id, { settings, css });
        setActiveTemplateCss(css);
    }, [settings]);


    // Section definitions for the index
    const sections = [
        { id: 'typography', label: 'Typography', icon: TypeIcon },
        { id: 'page-settings', label: 'Page Settings', icon: Layout },
        { id: 'code-blocks', label: 'Code Blocks', icon: CodeIcon },
        { id: 'header', label: 'Header', icon: ArrowUpFromLine },
        { id: 'footer', label: 'Footer', icon: ArrowDownToLine },
    ];

    const [activeSection, setActiveSection] = useState('typography');

    const scrollToSection = (sectionId: string) => {
        const element = document.getElementById(`section-${sectionId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Intersection observer to track active section
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id.replace('section-', '');
                        setActiveSection(id);
                    }
                });
            },
            { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' }
        );

        sections.forEach((section) => {
            const element = document.getElementById(`section-${section.id}`);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, []);

    return (
        <div className="flex-1 flex bg-white min-h-0">
            {/* Main Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-16 w-full space-y-16 pb-24">

                    {/* Typography Section */}
                    <section id="section-typography" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                                <TypeIcon size={22} className="text-zinc-900" />
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Typography</h2>
                        </div>

                        <div className="p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-zinc-50">
                            <div className="grid grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Font Family</label>
                                    <select
                                        className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm font-semibold text-zinc-800 transition-all outline-none hover:bg-zinc-50 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 appearance-none cursor-pointer"
                                        value={settings.fontFamily}
                                        onChange={(e) => updateSetting('fontFamily', e.target.value)}
                                    >
                                        <option value="Inter, sans-serif">Inter (Modern Sans)</option>
                                        <option value="'Times New Roman', serif">Times New Roman (Academic)</option>
                                        <option value="'Georgia', serif">Georgia (Classic Serif)</option>
                                        <option value="'Outfit', sans-serif">Outfit (Geometric)</option>
                                        <option value="monospace">JetBrains Mono (Code)</option>
                                        <option value="system-ui, sans-serif">System Default</option>
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Base Font Size</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm font-semibold text-zinc-800 transition-all outline-none hover:bg-zinc-50 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200"
                                        value={settings.fontSize}
                                        onChange={(e) => updateSetting('fontSize', e.target.value)}
                                        placeholder="e.g. 16px"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Default Text Color</label>
                                <div className="flex items-center gap-4 p-2 bg-zinc-50/50 border border-zinc-100 rounded-2xl group transition-all hover:bg-zinc-50">
                                    <div className="h-12 w-12 shrink-0 rounded-xl border-2 border-white shadow-sm overflow-hidden p-0 relative" style={{ backgroundColor: settings.textColor }}>
                                        <input
                                            type="color"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            value={settings.textColor}
                                            onChange={(e) => updateSetting('textColor', e.target.value)}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        className="flex-1 bg-transparent border-none text-sm font-bold text-zinc-800 outline-none uppercase tracking-wider"
                                        value={settings.textColor}
                                        onChange={(e) => updateSetting('textColor', e.target.value)}
                                    />
                                    <div className="h-2 w-2 rounded-full bg-zinc-200 mr-4 group-hover:bg-zinc-400 transition-colors" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Page Settings Section */}
                    <section id="section-page-settings" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                                <Layout size={22} className="text-zinc-900" />
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Page settings</h2>
                        </div>

                        <div className="p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-12 ring-1 ring-zinc-50">
                            {/* Layout Selection */}
                            <div className="space-y-5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Page Orientation</label>
                                <div className="flex gap-6">
                                    {[
                                        { id: 'vertical', label: 'Portrait', icon: Maximize },
                                        { id: 'horizontal', label: 'Landscape', icon: Maximize }
                                    ].map((layout) => (
                                        <button
                                            key={layout.id}
                                            onClick={() => updateSetting('pageLayout', layout.id)}
                                            className={cn(
                                                "w-40 flex flex-col items-center gap-3 p-5 rounded-[1.5rem] border-2 transition-all duration-300",
                                                settings.pageLayout === layout.id
                                                    ? "border-zinc-900 bg-zinc-900 text-white shadow-lg scale-[1.02]"
                                                    : "border-zinc-100 bg-zinc-50/50 text-zinc-400 hover:border-zinc-200 hover:bg-zinc-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-10 border-2 rounded-sm flex items-center justify-center transition-colors",
                                                settings.pageLayout === layout.id ? "border-white/40" : "border-zinc-200",
                                                layout.id === 'horizontal' && "rotate-90"
                                            )}>
                                                <div className={cn("w-0.5 h-0.5 rounded-full", settings.pageLayout === layout.id ? "bg-white/20" : "bg-zinc-200")} />
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{layout.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Margins */}
                            <div className="space-y-5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Margins (mm)</label>
                                <div className="grid grid-cols-4 gap-6">
                                    {[
                                        { label: 'Top', path: 'margins.top' },
                                        { label: 'Bottom', path: 'margins.bottom' },
                                        { label: 'Left', path: 'margins.left' },
                                        { label: 'Right', path: 'margins.right' }
                                    ].map((m) => (
                                        <div key={m.path} className="space-y-3">
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase ml-2">{m.label}</span>
                                            <input
                                                type="text"
                                                className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-800 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 transition-all outline-none text-center"
                                                value={(settings.margins as any)[m.label.toLowerCase()].replace('mm', '')}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                                    updateSetting(m.path, val ? `${val}mm` : '0mm');
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Background & Watermark */}
                            <div className="grid grid-cols-2 gap-10 pt-4 border-t border-zinc-50">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Background Color</label>
                                    <div className="flex items-center gap-4 p-2 bg-zinc-50/50 border border-zinc-100 rounded-2xl group transition-all hover:bg-zinc-50">
                                        <div className="h-12 w-12 shrink-0 rounded-xl border-2 border-white shadow-sm overflow-hidden p-0 relative" style={{ backgroundColor: settings.backgroundColor }}>
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                value={settings.backgroundColor}
                                                onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent border-none text-sm font-bold text-zinc-800 outline-none uppercase tracking-wider"
                                            value={settings.backgroundColor}
                                            onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Watermark Text</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-5 py-[1.125rem] text-sm font-bold text-zinc-800 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 transition-all outline-none"
                                        value={settings.watermark || ''}
                                        onChange={(e) => updateSetting('watermark', e.target.value)}
                                        placeholder="None"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Code Blocks Section */}
                    <section id="section-code-blocks" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                                <CodeIcon size={22} className="text-zinc-900" />
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Code Blocks</h2>
                        </div>

                        <div className="p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-zinc-50">
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Theme</label>
                                <select
                                    className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm font-semibold text-zinc-800 transition-all outline-none hover:bg-zinc-50 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 appearance-none cursor-pointer"
                                    value={settings.codeBlockTheme || 'github'}
                                    onChange={(e) => updateSetting('codeBlockTheme', e.target.value)}
                                >
                                    <option value="github">GitHub</option>
                                    <option value="github-dark">GitHub Dark</option>
                                    <option value="monokai">Monokai</option>
                                    <option value="dracula">Dracula</option>
                                    <option value="vs">Visual Studio</option>
                                    <option value="vs2015">Visual Studio 2015</option>
                                    <option value="atom-one-dark">Atom One Dark</option>
                                    <option value="solarized-light">Solarized Light</option>
                                    <option value="solarized-dark">Solarized Dark</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Header Section */}
                    <section id="section-header" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                                <ArrowUpFromLine size={22} className="text-zinc-900" />
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Header</h2>
                        </div>

                        <div className="p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-zinc-50">
                            {/* Enable Toggle */}
                            <div className="flex items-center gap-6">
                                <label className="text-base font-semibold text-zinc-800">Enable header</label>
                                <button
                                    onClick={() => updateSetting('header.enabled', !settings.header?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative",
                                        settings.header?.enabled ? "bg-zinc-900" : "bg-zinc-200"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-white shadow-sm absolute top-1 transition-all duration-300",
                                        settings.header?.enabled ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {settings.header?.enabled && (
                                <>
                                    {/* Plate Editor for Header Content */}
                                    <HeaderFooterPlateEditor
                                        content={settings.header?.content || ''}
                                        onChange={(value) => updateSetting('header.content', value)}
                                        placeholder="Type something..."
                                    />

                                    {/* Margins */}
                                    <div className="space-y-5">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Margins (mm)</label>
                                        <div className="grid grid-cols-4 gap-6">
                                            {[
                                                { label: 'Top', path: 'header.margins.top' },
                                                { label: 'Bottom', path: 'header.margins.bottom' },
                                                { label: 'Left', path: 'header.margins.left' },
                                                { label: 'Right', path: 'header.margins.right' }
                                            ].map((m) => (
                                                <div key={m.path} className="space-y-3">
                                                    <span className="text-[9px] font-bold text-zinc-400 uppercase ml-2">{m.label}</span>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-800 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 transition-all outline-none text-center"
                                                        value={((settings.header?.margins as any)?.[m.label.toLowerCase()] || '0mm').replace('mm', '')}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                                            updateSetting(m.path, val ? `${val}mm` : '0mm');
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {/* Footer Section */}
                    <section id="section-footer" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                                <ArrowDownToLine size={22} className="text-zinc-900" />
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Footer</h2>
                        </div>

                        <div className="p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-zinc-50">
                            {/* Enable Toggle */}
                            <div className="flex items-center gap-6">
                                <label className="text-base font-semibold text-zinc-800">Enable footer</label>
                                <button
                                    onClick={() => updateSetting('footer.enabled', !settings.footer?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative",
                                        settings.footer?.enabled ? "bg-zinc-900" : "bg-zinc-200"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-white shadow-sm absolute top-1 transition-all duration-300",
                                        settings.footer?.enabled ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {settings.footer?.enabled && (
                                <>
                                    {/* Plate Editor for Footer Content */}
                                    <HeaderFooterPlateEditor
                                        content={settings.footer?.content || ''}
                                        onChange={(value) => updateSetting('footer.content', value)}
                                        placeholder="Type something..."
                                    />

                                    {/* Margins */}
                                    <div className="space-y-5">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 ml-1">Margins (mm)</label>
                                        <div className="grid grid-cols-4 gap-6">
                                            {[
                                                { label: 'Top', path: 'footer.margins.top' },
                                                { label: 'Bottom', path: 'footer.margins.bottom' },
                                                { label: 'Left', path: 'footer.margins.left' },
                                                { label: 'Right', path: 'footer.margins.right' }
                                            ].map((m) => (
                                                <div key={m.path} className="space-y-3">
                                                    <span className="text-[9px] font-bold text-zinc-400 uppercase ml-2">{m.label}</span>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-zinc-50/50 border border-zinc-100 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-800 focus:bg-white focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-200 transition-all outline-none text-center"
                                                        value={((settings.footer?.margins as any)?.[m.label.toLowerCase()] || '0mm').replace('mm', '')}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                                            updateSetting(m.path, val ? `${val}mm` : '0mm');
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Right Side Index */}
            <div className="w-48 shrink-0">
                <div className="sticky top-0 p-6 pt-16">
                    <nav className="space-y-1">
                        {sections.map((section) => {
                            const Icon = section.icon;
                            const isActive = activeSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => scrollToSection(section.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                                        isActive
                                            ? "text-zinc-900"
                                            : "text-zinc-400 hover:text-zinc-600"
                                    )}
                                >
                                    <Icon size={16} className={cn(
                                        "shrink-0 transition-colors",
                                        isActive ? "text-zinc-900" : "text-zinc-400"
                                    )} />
                                    <span className={cn(
                                        "text-xs truncate",
                                        isActive ? "font-semibold" : "font-medium"
                                    )}>
                                        {section.label}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>
        </div>
    );
}
