"use client";

import { useStore } from "@/lib/store";
import { LayoutTemplate, Maximize, Type as TypeIcon, ArrowUpFromLine, ArrowDownToLine, CodeIcon, Heading as HeadingIcon, ListOrdered, AlignLeft, AlignCenter, AlignRight, Bold, Underline, Baseline, ChevronDown, FileText, TableIcon } from "lucide-react";
import { useState, useEffect, useMemo, Fragment } from "react";
import { cn } from "@/lib/utils";
import { HeaderFooterPlateEditor } from "@/components/plate-editor/header-footer-plate-editor";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/plate-ui/dropdown-menu";

// Available fonts in Typst WASM compiler (from typst.ts text assets)
// These are the only built-in fonts that work for PDF export
const FONT_FAMILIES = [
    // Serif - Libertinus Serif (the main text font)
    { label: 'Libertinus Serif (Classic)', value: "'Libertinus Serif', serif", category: 'Serif' },
    
    // Monospace - DejaVu Sans Mono
    { label: 'DejaVu Sans Mono (Code)', value: "'DejaVu Sans Mono', monospace", category: 'Monospace' },
    
    // Math/Academic - New Computer Modern
    { label: 'New Computer Modern (Academic)', value: "'New Computer Modern', serif", category: 'Serif' },
];

export function TemplateEditor() {
    const { activeTemplateId, templates, updateTemplate, setActiveTemplateCss, closeTab, customFonts } = useStore();
    const template = templates.find(t => t.id === activeTemplateId);

    const allFontFamilies = useMemo(() => {
        const custom = customFonts.map(f => ({
            label: `${f.family} (Custom)`,
            value: `'${f.family}'`,
            category: 'Custom'
        }));
        return [...FONT_FAMILIES, ...custom];
    }, [customFonts]);

    const [settings, setSettings] = useState(template?.settings);
    const [activeHeadingLevel, setActiveHeadingLevel] = useState<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>('h1');

    // Only update local settings when we switch templates
    useEffect(() => {
        if (template?.settings) {
            setSettings(template.settings);
        }
    }, [activeTemplateId]);

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

    // Autosave local settings to store with debounce
    useEffect(() => {
        if (!settings || !template) return;

        const timeoutId = setTimeout(() => {
            const css = generateCss(settings);

            // Check if settings actually changed to avoid unnecessary store updates
            const currentStoreTemplate = useStore.getState().templates.find(t => t.id === template.id);
            if (JSON.stringify(currentStoreTemplate?.settings) === JSON.stringify(settings)) {
                return;
            }

            updateTemplate(template.id, { settings, css });
            setActiveTemplateCss(css);

            // Also persist to IndexedDB
            useStore.getState().saveTemplate(template.id, { ...template, settings, css });
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [settings, template?.id, updateTemplate, setActiveTemplateCss]);

    // Section definitions for the index
    const sections = useMemo(() => [
        { id: 'typography', label: 'Typography', icon: TypeIcon },
        { id: 'headings', label: 'Headings', icon: HeadingIcon },
        { id: 'page-settings', label: 'Page Settings', icon: LayoutTemplate },
        { id: 'code-blocks', label: 'Code Blocks', icon: CodeIcon },
        { id: 'tables', label: 'Tables', icon: TableIcon },
        { id: 'front-page', label: 'Front Page', icon: FileText },
        { id: 'header', label: 'Header', icon: ArrowUpFromLine },
        { id: 'footer', label: 'Footer', icon: ArrowDownToLine },
    ], []);

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
    }, [sections]);

    if (!template || !settings) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/10">
                <LayoutTemplate className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-sm font-medium opacity-50">Select a template to design</p>
            </div>
        );
    }

    // Generate CSS for browser print functionality
    // The PDF export API generates its own CSS from settings directly
    // This CSS is only used for browser print (Ctrl+P)
    const generateCss = (s: typeof settings) => {
        const margins = s.margins || { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };
        const headerMargins = s.header?.margins || { bottom: '0mm', left: '0mm', right: '0mm' };
        const footerMargins = s.footer?.margins || { top: '0mm', left: '0mm', right: '0mm' };

        // Check for page number offset
        const headerMatch = s.header?.content?.match(/"offset":\s*(\d+)/);
        const footerMatch = s.footer?.content?.match(/"offset":\s*(\d+)/);
        const offset = headerMatch ? parseInt(headerMatch[1]) : (footerMatch ? parseInt(footerMatch[1]) : 0);

        const generateHeadingCss = (level: string, style: any) => {
            if (!style) return '';
            return `
            .prose ${level} { 
                font-size: ${style.fontSize} !important; 
                color: ${style.color} !important; 
                text-align: ${style.textAlign} !important;
                border-bottom: ${style.borderBottom ? '1px solid ' + style.color : 'none'} !important;
                text-transform: ${style.textTransform} !important;
                font-weight: ${style.fontWeight} !important;
                text-decoration: ${style.textDecoration} !important;
                margin-top: 1.5em !important;
                margin-bottom: 0.5em !important;
            }
            `;
        };

        const generateNumberingCss = () => {
            const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
            
            // Find the first enabled level - this becomes the "root" for numbering
            const firstEnabledIndex = levels.findIndex(level => (s as any)[level]?.numbering?.enabled);
            if (firstEnabledIndex === -1) return ''; // No numbering enabled
            
            // Reset all counters at the root, starting from the first enabled level
            const countersToReset = levels.slice(firstEnabledIndex).map(l => `${l}-counter`).join(' ');
            let css = `.prose { counter-reset: ${countersToReset}; }\n`;

            // Add resets: each heading resets all lower-level counters
            levels.forEach((level, index) => {
                if (index < levels.length - 1) {
                    // Reset all counters below this level
                    const lowerCounters = levels.slice(index + 1).map(l => `${l}-counter`).join(' ');
                    css += `.prose ${level} { counter-reset: ${lowerCounters}; }\n`;
                }
            });

            // Add counters - only for enabled levels
            levels.forEach((level, index) => {
                const settings = (s as any)[level]?.numbering;
                if (!settings?.enabled) return;

                let contentString = `"${settings.prefix}"`;

                // Build the hierarchy string - only include enabled levels from firstEnabledIndex to current
                for (let i = firstEnabledIndex; i <= index; i++) {
                    const currentLevel = levels[i];
                    const currentSettings = (s as any)[currentLevel]?.numbering;

                    if (currentSettings?.enabled) {
                        contentString += ` counter(${currentLevel}-counter, ${currentSettings.style})`;

                        // Add separator if it's not the last enabled item
                        // Check if there are any subsequent enabled levels up to 'index'
                        let hasMoreEnabled = false;
                        for (let j = i + 1; j <= index; j++) {
                            if ((s as any)[levels[j]]?.numbering?.enabled) {
                                hasMoreEnabled = true;
                                break;
                            }
                        }

                        if (hasMoreEnabled) {
                            contentString += ` "${currentSettings.separator}"`;
                        }
                    }
                }

                contentString += ` "${settings.suffix}"`;

                css += `
                .prose ${level}::before { 
                    counter-increment: ${level}-counter !important; 
                    content: ${contentString} !important; 
                    margin-right: 0.5em !important;
                }\n`;
            });

            return css;
        };

        const numberingCss = generateNumberingCss();

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
            ${generateHeadingCss('h1', s.h1)}
            ${generateHeadingCss('h2', s.h2)}
            ${generateHeadingCss('h3', s.h3)}
            ${generateHeadingCss('h4', s.h4)}
            ${generateHeadingCss('h5', s.h5)}
            ${generateHeadingCss('h6', s.h6)}
            ${numberingCss}
            .page-header, .page-footer {
                flex-shrink: 0;
                width: 100%;
            }
            .page-header {
                padding-right: ${headerMargins.right};
                padding-bottom: ${headerMargins.bottom};
                padding-left: ${headerMargins.left};
            }
            .page-footer {
                padding-top: ${footerMargins.top};
                padding-right: ${footerMargins.right};
                padding-left: ${footerMargins.left};
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





    return (
        <div className="flex-1 flex bg-background min-h-0 app-chrome">
            {/* Main Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-16 w-full space-y-16 pb-24">

                    {/* Typography Section */}
                    <section id="section-typography" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <TypeIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Typography</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            <div className="grid grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Font Family</label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border flex items-center justify-between cursor-pointer">
                                                <span style={{ fontFamily: settings.fontFamily }}>
                                                    {allFontFamilies.find(f => f.value === settings.fontFamily)?.label || settings.fontFamily}
                                                </span>
                                                <ChevronDown size={16} className="text-muted-foreground" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border border-border rounded-xl p-1 shadow-xl max-h-[400px] overflow-y-auto no-scrollbar">
                                            {['Sans Serif', 'Serif', 'Monospace', 'Custom'].map((category, index) => {
                                                const categoryFonts = allFontFamilies.filter(f => f.category === category);
                                                if (categoryFonts.length === 0) return null;

                                                return (
                                                    <Fragment key={category}>
                                                        <div className={cn(
                                                            "px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70",
                                                            index > 0 && "mt-2 border-t border-border/50 pt-3"
                                                        )}>
                                                            {category}
                                                        </div>
                                                        {categoryFonts.map((font) => (
                                                            <DropdownMenuItem
                                                                key={font.value}
                                                                className={cn(
                                                                    "flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors focus:bg-muted focus:text-foreground",
                                                                    settings.fontFamily === font.value && "bg-muted text-foreground font-bold"
                                                                )}
                                                                style={{ fontFamily: font.value }}
                                                                onSelect={() => updateSetting('fontFamily', font.value)}
                                                            >
                                                                {font.label}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </Fragment>
                                                );
                                            })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Font Size</label>
                                    <input
                                        type="number"
                                        min="8"
                                        max="72"
                                        className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                        value={parseInt(settings.fontSize) || 16}
                                        onChange={(e) => updateSetting('fontSize', `${e.target.value}px`)}
                                        placeholder="e.g. 16"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Default Text Color</label>
                                <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                    <div className="h-12 w-12 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" style={{ backgroundColor: settings.textColor }}>
                                        <input
                                            type="color"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            value={settings.textColor}
                                            onChange={(e) => updateSetting('textColor', e.target.value)}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        className="flex-1 bg-transparent border-none text-sm font-bold text-foreground outline-none uppercase tracking-wider"
                                        value={settings.textColor}
                                        onChange={(e) => updateSetting('textColor', e.target.value)}
                                    />
                                    <div className="h-2 w-2 rounded-full bg-muted-foreground/20 mr-4 group-hover:bg-muted-foreground/40 transition-colors" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Headings Section */}
                    <section id="section-headings" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <HeadingIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Headings</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-10 ring-1 ring-border/50">
                            {/* Heading Level Selector */}
                            <div className="flex items-center gap-4 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setActiveHeadingLevel(level)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                                            activeHeadingLevel === level
                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Font Size</label>
                                    <input
                                        type="number"
                                        min="8"
                                        max="200"
                                        className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                        value={parseInt((settings as any)[activeHeadingLevel].fontSize) || 16}
                                        onChange={(e) => updateSetting(`${activeHeadingLevel}.fontSize`, `${e.target.value}px`)}
                                        placeholder="e.g. 32"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Color</label>
                                    <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                        <div className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" style={{ backgroundColor: (settings as any)[activeHeadingLevel].color }}>
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                value={(settings as any)[activeHeadingLevel].color}
                                                onChange={(e) => updateSetting(`${activeHeadingLevel}.color`, e.target.value)}
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                            value={(settings as any)[activeHeadingLevel].color}
                                            onChange={(e) => updateSetting(`${activeHeadingLevel}.color`, e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Alignment</label>
                                    <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                        {[
                                            { id: 'left', icon: AlignLeft },
                                            { id: 'center', icon: AlignCenter },
                                            { id: 'right', icon: AlignRight }
                                        ].map((align) => (
                                            <button
                                                key={align.id}
                                                onClick={() => updateSetting(`${activeHeadingLevel}.textAlign`, align.id)}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all",
                                                    (settings as any)[activeHeadingLevel].textAlign === align.id
                                                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <align.icon size={16} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Formatting</label>
                                    <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                        <button
                                            onClick={() => updateSetting(`${activeHeadingLevel}.fontWeight`, (settings as any)[activeHeadingLevel].fontWeight === '700' ? '400' : '700')}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                (settings as any)[activeHeadingLevel].fontWeight === '700'
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Bold size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting(`${activeHeadingLevel}.textDecoration`, (settings as any)[activeHeadingLevel].textDecoration === 'underline' ? 'none' : 'underline')}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                (settings as any)[activeHeadingLevel].textDecoration === 'underline'
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Underline size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting(`${activeHeadingLevel}.borderBottom`, !(settings as any)[activeHeadingLevel].borderBottom)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                (settings as any)[activeHeadingLevel].borderBottom
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            title="Border Bottom"
                                        >
                                            <Baseline size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Text Transform</label>
                                <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                    {[
                                        { id: 'none', label: 'None' },
                                        { id: 'uppercase', label: 'UPPER' },
                                        { id: 'capitalize', label: 'Title' }
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => updateSetting(`${activeHeadingLevel}.textTransform`, t.id)}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                                                (settings as any)[activeHeadingLevel].textTransform === t.id
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-8 border-t border-border space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-muted rounded-xl">
                                            <ListOrdered size={18} className="text-foreground" />
                                        </div>
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Numbering</h3>
                                    </div>
                                    <button
                                        onClick={() => updateSetting(`${activeHeadingLevel}.numbering.enabled`, !(settings as any)[activeHeadingLevel].numbering?.enabled)}
                                        className={cn(
                                            "w-12 h-6 rounded-full transition-all duration-300 relative",
                                            (settings as any)[activeHeadingLevel].numbering?.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                            (settings as any)[activeHeadingLevel].numbering?.enabled ? "left-7" : "left-1"
                                        )} />
                                    </button>
                                </div>

                                {(settings as any)[activeHeadingLevel].numbering?.enabled && (
                                    <div className="grid grid-cols-2 gap-10 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Style</label>
                                            <select
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border appearance-none cursor-pointer"
                                                value={(settings as any)[activeHeadingLevel].numbering.style}
                                                onChange={(e) => updateSetting(`${activeHeadingLevel}.numbering.style`, e.target.value)}
                                            >
                                                <option value="decimal">1, 2, 3</option>
                                                <option value="decimal-leading-zero">01, 02, 03</option>
                                                <option value="lower-roman">i, ii, iii</option>
                                                <option value="upper-roman">I, II, III</option>
                                                <option value="lower-alpha">a, b, c</option>
                                                <option value="upper-alpha">A, B, C</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Separator</label>
                                            <input
                                                type="text"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={(settings as any)[activeHeadingLevel].numbering.separator}
                                                onChange={(e) => updateSetting(`${activeHeadingLevel}.numbering.separator`, e.target.value)}
                                                placeholder="e.g. ."
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Prefix</label>
                                            <input
                                                type="text"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={(settings as any)[activeHeadingLevel].numbering.prefix}
                                                onChange={(e) => updateSetting(`${activeHeadingLevel}.numbering.prefix`, e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Suffix</label>
                                            <input
                                                type="text"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={(settings as any)[activeHeadingLevel].numbering.suffix}
                                                onChange={(e) => updateSetting(`${activeHeadingLevel}.numbering.suffix`, e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Page Settings Section */}
                    <section id="section-page-settings" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <LayoutTemplate size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Page settings</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-12 ring-1 ring-border/50">
                            {/* Layout Selection */}
                            <div className="space-y-5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Page Orientation</label>
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
                                                    ? "border-primary bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                                                    : "border-border bg-muted/50 text-muted-foreground hover:border-border hover:bg-muted"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-10 border-2 rounded-sm flex items-center justify-center transition-colors",
                                                settings.pageLayout === layout.id ? "border-primary-foreground/40" : "border-border",
                                                layout.id === 'horizontal' && "rotate-90"
                                            )}>
                                                <div className={cn("w-0.5 h-0.5 rounded-full", settings.pageLayout === layout.id ? "bg-primary-foreground/20" : "bg-border")} />
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{layout.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Margins */}
                            <div className="space-y-5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Margins (mm)</label>
                                <div className="grid grid-cols-4 gap-6">
                                    {[
                                        { label: 'Top', path: 'margins.top' },
                                        { label: 'Bottom', path: 'margins.bottom' },
                                        { label: 'Left', path: 'margins.left' },
                                        { label: 'Right', path: 'margins.right' }
                                    ].map((m) => (
                                        <div key={m.path} className="space-y-3">
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase ml-2">{m.label}</span>
                                            <input
                                                type="text"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-4 py-4 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
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
                            <div className="grid grid-cols-2 gap-10 pt-4 border-t border-border">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Background Color</label>
                                    <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                        <div className="h-12 w-12 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" style={{ backgroundColor: settings.backgroundColor }}>
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                value={settings.backgroundColor}
                                                onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent border-none text-sm font-bold text-foreground outline-none uppercase tracking-wider"
                                            value={settings.backgroundColor}
                                            onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Watermark Text</label>
                                    <input
                                        type="text"
                                        className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-[1.125rem] text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none"
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
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <CodeIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Code Blocks</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Theme</label>
                                <select
                                    className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border appearance-none cursor-pointer"
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

                    {/* Tables Section */}
                    <section id="section-tables" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <TableIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Tables</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            {/* Prevent Page Break Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-base font-semibold text-foreground">Prevent page breaks</label>
                                    <p className="text-sm text-muted-foreground">
                                        When enabled, tables will try to stay on a single page instead of being split across pages.
                                    </p>
                                </div>
                                <button
                                    onClick={() => updateSetting('tables.preventPageBreak', !settings.tables?.preventPageBreak)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative shrink-0 ml-4",
                                        settings.tables?.preventPageBreak ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        settings.tables?.preventPageBreak ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Front Page Section */}
                    <section id="section-front-page" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <FileText size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Front Page</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            {/* Enable Toggle */}
                            <div className="flex items-center gap-6">
                                <label className="text-base font-semibold text-foreground">Enable front page</label>
                                <button
                                    onClick={() => updateSetting('frontPage.enabled', !settings.frontPage?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative",
                                        settings.frontPage?.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        settings.frontPage?.enabled ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {settings.frontPage?.enabled && (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        The front page will be inserted as the first page of your document, before the main content.
                                    </p>

                                    {/* Plate Editor for Front Page Content */}
                                    <HeaderFooterPlateEditor
                                        content={settings.frontPage?.content || ''}
                                        onChange={(value) => updateSetting('frontPage.content', value)}
                                        placeholder="Design your front page..."
                                        variant="large"
                                    />
                                </>
                            )}
                        </div>
                    </section>

                    {/* Header Section */}
                    <section id="section-header" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <ArrowUpFromLine size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Header</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            {/* Enable Toggle */}
                            <div className="flex items-center gap-6">
                                <label className="text-base font-semibold text-foreground">Enable header</label>
                                <button
                                    onClick={() => updateSetting('header.enabled', !settings.header?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative",
                                        settings.header?.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
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

                                    {/* Start Page */}
                                    <div className="flex items-center gap-4">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Start from page</label>
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-24 bg-muted/50 border border-border rounded-2xl px-4 py-3 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
                                            value={settings.header?.startPage || 1}
                                            onChange={(e) => {
                                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                                updateSetting('header.startPage', val);
                                            }}
                                        />
                                    </div>

                                    {/* Margins */}
                                    <div className="space-y-5">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Margins (mm)</label>
                                        <div className="grid grid-cols-3 gap-6">
                                            {[
                                                { label: 'Bottom', path: 'header.margins.bottom' },
                                                { label: 'Left', path: 'header.margins.left' },
                                                { label: 'Right', path: 'header.margins.right' }
                                            ].map((m) => (
                                                <div key={m.path} className="space-y-3">
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase ml-2">{m.label}</span>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-muted/50 border border-border rounded-2xl px-4 py-4 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
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
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <ArrowDownToLine size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Footer</h2>
                        </div>

                        <div className="p-10 bg-card border border-border rounded-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
                            {/* Enable Toggle */}
                            <div className="flex items-center gap-6">
                                <label className="text-base font-semibold text-foreground">Enable footer</label>
                                <button
                                    onClick={() => updateSetting('footer.enabled', !settings.footer?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative",
                                        settings.footer?.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
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

                                    {/* Start Page */}
                                    <div className="flex items-center gap-4">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Start from page</label>
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-24 bg-muted/50 border border-border rounded-2xl px-4 py-3 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
                                            value={settings.footer?.startPage || 1}
                                            onChange={(e) => {
                                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                                updateSetting('footer.startPage', val);
                                            }}
                                        />
                                    </div>

                                    {/* Margins */}
                                    <div className="space-y-5">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Margins (mm)</label>
                                        <div className="grid grid-cols-3 gap-6">
                                            {[
                                                { label: 'Top', path: 'footer.margins.top' },
                                                { label: 'Left', path: 'footer.margins.left' },
                                                { label: 'Right', path: 'footer.margins.right' }
                                            ].map((m) => (
                                                <div key={m.path} className="space-y-3">
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase ml-2">{m.label}</span>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-muted/50 border border-border rounded-2xl px-4 py-4 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
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
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground/80"
                                    )}
                                >
                                    <Icon size={16} className={cn(
                                        "shrink-0 transition-colors",
                                        isActive ? "text-foreground" : "text-muted-foreground"
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
