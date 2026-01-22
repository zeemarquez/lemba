"use client";

import { useStore, TemplateVariable } from "@/lib/store";
import { LayoutTemplate, Maximize, Type as TypeIcon, ArrowUpFromLine, ArrowDownToLine, CodeIcon, Heading as HeadingIcon, ListOrdered, AlignLeft, AlignCenter, AlignRight, Bold, Underline, Italic, Baseline, ChevronDown, FileText, TableIcon, List, Variable, Plus, Trash2, ImageIcon } from "lucide-react";
import { Input } from "@/components/plate-ui/input";
import { Button } from "@/components/plate-ui/button";
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

    // Update local settings when template changes or becomes available
    useEffect(() => {
        if (template?.settings) {
            setSettings(template.settings);
        } else if (activeTemplateId && !template) {
            // Template ID is set but template not found - clear settings
            setSettings(undefined);
        }
    }, [activeTemplateId, template, templates]);

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
        { id: 'variables', label: 'Variables', icon: Variable },
        { id: 'typography', label: 'Typography', icon: TypeIcon },
        { id: 'headings', label: 'Headings', icon: HeadingIcon },
        { id: 'page-settings', label: 'Page Settings', icon: LayoutTemplate },
        { id: 'figures', label: 'Figures', icon: ImageIcon },
        { id: 'code-blocks', label: 'Code Blocks', icon: CodeIcon },
        { id: 'tables', label: 'Tables', icon: TableIcon },
        { id: 'outline', label: 'Index', icon: List },
        { id: 'front-page', label: 'Front Page', icon: FileText },
        { id: 'header', label: 'Header', icon: ArrowUpFromLine },
        { id: 'footer', label: 'Footer', icon: ArrowDownToLine },
    ], []);

    const [activeSection, setActiveSection] = useState('variables');

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

    // Show empty state only if we have templates loaded but no active template, or if activeTemplateId is set but template not found
    // Don't show empty state if templates array is empty (still loading) and activeTemplateId is set (might be restoring)
    const isLoading = templates.length === 0 && activeTemplateId !== null;
    
    if (isLoading) {
        // Still loading templates, don't show empty state yet
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/10">
                <LayoutTemplate className="h-16 w-16 mb-4 opacity-10 animate-pulse" />
                <p className="text-sm font-medium opacity-50">Loading template...</p>
            </div>
        );
    }
    
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

        // Calculate page number offset from startPageNumber setting
        // If startPageNumber is 2, page 2 should display as 1, so offset = 1 - 2 = -1
        const startPageNumber = s.startPageNumber || 1;
        const offset = 1 - startPageNumber;

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
                <div className="p-8 w-full space-y-12 pb-24">

                    {/* Variables Section */}
                    <section id="section-variables" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <Variable size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Variables</h2>
                        </div>

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
                            <p className="text-sm text-muted-foreground">
                                Define document variables that can be inserted into headers and footers. Variable values are set per-document when exporting.
                            </p>
                            
                            <div className="space-y-3">
                                {(settings.variables || []).map((variable: TemplateVariable, index: number) => (
                                    <div key={variable.id} className="flex items-center gap-3">
                                        <Input
                                            type="text"
                                            placeholder="Variable name"
                                            className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm"
                                            value={variable.name}
                                            onChange={(e) => {
                                                const newVariables = [...(settings.variables || [])];
                                                newVariables[index] = { ...variable, name: e.target.value };
                                                updateSetting('variables', newVariables);
                                            }}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 text-muted-foreground hover:text-destructive"
                                            onClick={() => {
                                                const newVariables = (settings.variables || []).filter((_: TemplateVariable, i: number) => i !== index);
                                                updateSetting('variables', newVariables);
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                ))}
                                
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl border-dashed"
                                    onClick={() => {
                                        const newVariable: TemplateVariable = {
                                            id: `var-${Date.now()}`,
                                            name: ''
                                        };
                                        updateSetting('variables', [...(settings.variables || []), newVariable]);
                                    }}
                                >
                                    <Plus size={16} className="mr-2" />
                                    Add Variable
                                </Button>
                            </div>
                        </div>
                    </section>

                    {/* Typography Section */}
                    <section id="section-typography" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <TypeIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Typography</h2>
                        </div>

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
                            <div className="grid grid-cols-2 gap-6">
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
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

                            <div className="grid grid-cols-2 gap-6">
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

                            <div className="grid grid-cols-2 gap-6">
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
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Style</label>
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
                                            onClick={() => updateSetting(`${activeHeadingLevel}.fontStyle`, (settings as any)[activeHeadingLevel].fontStyle === 'italic' ? 'normal' : 'italic')}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                (settings as any)[activeHeadingLevel].fontStyle === 'italic'
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Italic size={16} />
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
                                    <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-8 ring-1 ring-border/50">
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
                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border">
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

                            {/* Start Page Number */}
                            <div className="pt-4 border-t border-border">
                                <div className="space-y-3 max-w-xs">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Start Page Number</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-24 bg-muted/50 border border-border rounded-2xl px-4 py-4 text-sm font-bold text-foreground focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border transition-all outline-none text-center"
                                        value={settings.startPageNumber || 1}
                                        onChange={(e) => updateSetting('startPageNumber', Math.max(1, parseInt(e.target.value) || 1))}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Figures Section */}
                    <section id="section-figures" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <ImageIcon size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Figures</h2>
                        </div>

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
                            {/* Caption Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-base font-semibold text-foreground">Enable captions</label>
                                    <p className="text-sm text-muted-foreground">
                                        Show captions below figures with automatic numbering.
                                    </p>
                                </div>
                                <button
                                    onClick={() => updateSetting('figures.captionEnabled', !(settings.figures?.captionEnabled ?? true))}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative shrink-0 ml-4",
                                        (settings.figures?.captionEnabled ?? true) ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        (settings.figures?.captionEnabled ?? true) ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {/* Caption Format */}
                            {(settings.figures?.captionEnabled ?? true) && (
                                <div className="pt-6 border-t border-border space-y-4">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Caption Format</label>
                                        <Input
                                            type="text"
                                            className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                            value={settings.figures?.captionFormat || 'Figure #: {Caption}'}
                                            onChange={(e) => updateSetting('figures.captionFormat', e.target.value)}
                                            placeholder="Figure #: {Caption}"
                                        />
                                        <p className="text-xs text-muted-foreground ml-1">
                                            Use <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">#</code> for figure number and <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{'{Caption}'}</code> for the caption text.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Default Size Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Default Size</h3>
                                <p className="text-sm text-muted-foreground -mt-4">
                                    Applied when images don&apos;t specify their own dimensions.
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Width</label>
                                        <Input
                                            type="text"
                                            className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                            value={settings.figures?.defaultWidth || ''}
                                            onChange={(e) => updateSetting('figures.defaultWidth', e.target.value)}
                                            placeholder="e.g., 100%, 400px"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Height</label>
                                        <Input
                                            type="text"
                                            className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                            value={settings.figures?.defaultHeight || ''}
                                            onChange={(e) => updateSetting('figures.defaultHeight', e.target.value)}
                                            placeholder="e.g., auto, 300px"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Alignment Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Alignment</h3>
                                <p className="text-sm text-muted-foreground -mt-4">
                                    Default alignment for figures without explicit alignment.
                                </p>

                                <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                    <button
                                        onClick={() => updateSetting('figures.alignment', 'left')}
                                        className={cn(
                                            "p-2.5 rounded-xl transition-all",
                                            (settings.figures?.alignment || 'center') === 'left'
                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Align left"
                                    >
                                        <AlignLeft size={16} />
                                    </button>
                                    <button
                                        onClick={() => updateSetting('figures.alignment', 'center')}
                                        className={cn(
                                            "p-2.5 rounded-xl transition-all",
                                            (settings.figures?.alignment || 'center') === 'center'
                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Align center"
                                    >
                                        <AlignCenter size={16} />
                                    </button>
                                    <button
                                        onClick={() => updateSetting('figures.alignment', 'right')}
                                        className={cn(
                                            "p-2.5 rounded-xl transition-all",
                                            (settings.figures?.alignment || 'center') === 'right'
                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Align right"
                                    >
                                        <AlignRight size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Margins Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Margins</h3>
                                <p className="text-sm text-muted-foreground -mt-4">
                                    Space around figures in millimeters.
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Top</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 pr-12 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={parseFloat(settings.figures?.margins?.top || '0') || 0}
                                                onChange={(e) => updateSetting('figures.margins.top', `${e.target.value}mm`)}
                                                placeholder="0"
                                            />
                                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">mm</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Bottom</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 pr-12 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={parseFloat(settings.figures?.margins?.bottom || '5') || 0}
                                                onChange={(e) => updateSetting('figures.margins.bottom', `${e.target.value}mm`)}
                                                placeholder="5"
                                            />
                                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">mm</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Left</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 pr-12 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={parseFloat(settings.figures?.margins?.left || '0') || 0}
                                                onChange={(e) => updateSetting('figures.margins.left', `${e.target.value}mm`)}
                                                placeholder="0"
                                            />
                                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">mm</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Right</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 pr-12 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                                value={parseFloat(settings.figures?.margins?.right || '0') || 0}
                                                onChange={(e) => updateSetting('figures.margins.right', `${e.target.value}mm`)}
                                                placeholder="0"
                                            />
                                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">mm</span>
                                        </div>
                                    </div>
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
                            {/* Theme Preset Dropdown */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Theme</label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="w-5 h-5 rounded border border-border"
                                                    style={{ backgroundColor: settings.codeBlocks?.backgroundColor || '#f6f8fa' }}
                                                />
                                                <span>{(() => {
                                                    const bg = settings.codeBlocks?.backgroundColor || '#f6f8fa';
                                                    const presets: Record<string, string> = {
                                                        '#f6f8fa': 'GitHub Light',
                                                        '#fafafa': 'One Light',
                                                        '#fdf6e3': 'Solarized Light',
                                                        '#f5f5f5': 'Light Gray',
                                                        '#fffffe': 'Nord Light',
                                                        '#1e1e1e': 'VS Code Dark',
                                                        '#282c34': 'One Dark',
                                                        '#282a36': 'Dracula',
                                                        '#24292e': 'GitHub Dark',
                                                        '#272822': 'Monokai',
                                                        '#002b36': 'Solarized Dark',
                                                    };
                                                    return presets[bg] || 'Custom';
                                                })()}</span>
                                            </div>
                                            <ChevronDown size={16} className="text-muted-foreground" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px]">
                                        {/* Light Themes */}
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#f6f8fa');
                                            updateSetting('codeBlocks.borderColor', '#d0d7de');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#f6f8fa' }} />
                                                <span>GitHub Light</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#fafafa');
                                            updateSetting('codeBlocks.borderColor', '#e5e5e5');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#fafafa' }} />
                                                <span>One Light</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#fdf6e3');
                                            updateSetting('codeBlocks.borderColor', '#eee8d5');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#fdf6e3' }} />
                                                <span>Solarized Light</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#f5f5f5');
                                            updateSetting('codeBlocks.borderColor', '#e0e0e0');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#f5f5f5' }} />
                                                <span>Light Gray</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#fffffe');
                                            updateSetting('codeBlocks.borderColor', '#e5e9f0');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#fffffe' }} />
                                                <span>Nord Light</span>
                                            </div>
                                        </DropdownMenuItem>
                                        {/* Dark Themes */}
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#1e1e1e');
                                            updateSetting('codeBlocks.borderColor', '#3c3c3c');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#1e1e1e' }} />
                                                <span>VS Code Dark</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#282c34');
                                            updateSetting('codeBlocks.borderColor', '#3e4451');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#282c34' }} />
                                                <span>One Dark</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#282a36');
                                            updateSetting('codeBlocks.borderColor', '#44475a');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#282a36' }} />
                                                <span>Dracula</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#24292e');
                                            updateSetting('codeBlocks.borderColor', '#444d56');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#24292e' }} />
                                                <span>GitHub Dark</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#272822');
                                            updateSetting('codeBlocks.borderColor', '#3e3d32');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#272822' }} />
                                                <span>Monokai</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                            updateSetting('codeBlocks.backgroundColor', '#002b36');
                                            updateSetting('codeBlocks.borderColor', '#073642');
                                        }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: '#002b36' }} />
                                                <span>Solarized Dark</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Show Language Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-base font-semibold text-foreground">Show language</label>
                                    <p className="text-sm text-muted-foreground">
                                        Display a language identifier tab in the top-right corner
                                    </p>
                                </div>
                                <button
                                    onClick={() => updateSetting('codeBlocks.showLanguage', !settings.codeBlocks?.showLanguage)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative shrink-0 ml-4",
                                        settings.codeBlocks?.showLanguage ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        settings.codeBlocks?.showLanguage ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {/* Show Line Numbers Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-base font-semibold text-foreground">Show line numbers</label>
                                    <p className="text-sm text-muted-foreground">
                                        Display line numbers on the left side of code blocks
                                    </p>
                                </div>
                                <button
                                    onClick={() => updateSetting('codeBlocks.showLineNumbers', settings.codeBlocks?.showLineNumbers === false ? true : false)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative shrink-0 ml-4",
                                        settings.codeBlocks?.showLineNumbers !== false ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        settings.codeBlocks?.showLineNumbers !== false ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {/* Background and Border Colors */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Appearance</h3>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Background Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Background Color</label>
                                        <div className="flex items-center gap-3 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.codeBlocks?.backgroundColor || '#f6f8fa' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.codeBlocks?.backgroundColor || '#f6f8fa'}
                                                    onChange={(e) => updateSetting('codeBlocks.backgroundColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 min-w-0 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.codeBlocks?.backgroundColor || ''}
                                                onChange={(e) => updateSetting('codeBlocks.backgroundColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.codeBlocks?.backgroundColor && (
                                                <button
                                                    onClick={() => updateSetting('codeBlocks.backgroundColor', '')}
                                                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Border Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Border Color</label>
                                        <div className="flex items-center gap-3 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.codeBlocks?.borderColor || '#e0e0e0' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.codeBlocks?.borderColor || '#e0e0e0'}
                                                    onChange={(e) => updateSetting('codeBlocks.borderColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 min-w-0 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.codeBlocks?.borderColor || ''}
                                                onChange={(e) => updateSetting('codeBlocks.borderColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.codeBlocks?.borderColor && (
                                                <button
                                                    onClick={() => updateSetting('codeBlocks.borderColor', '')}
                                                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Border Width */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Border Width</label>
                                    <select
                                        className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border appearance-none cursor-pointer"
                                        value={settings.codeBlocks?.borderWidth || '1'}
                                        onChange={(e) => updateSetting('codeBlocks.borderWidth', e.target.value)}
                                    >
                                        <option value="0">None</option>
                                        <option value="0.5">0.5pt</option>
                                        <option value="1">1pt</option>
                                        <option value="1.5">1.5pt</option>
                                        <option value="2">2pt</option>
                                    </select>
                                </div>
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
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

                            {/* Header Style Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Header Style</h3>

                                {/* Style Selector */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Style</label>
                                    <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                        <button
                                            onClick={() => updateSetting('tables.headerStyle.bold', settings.tables?.headerStyle?.bold === false ? true : false)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.headerStyle?.bold !== false
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Bold size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting('tables.headerStyle.italic', !settings.tables?.headerStyle?.italic)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.headerStyle?.italic
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Italic size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting('tables.headerStyle.underline', !settings.tables?.headerStyle?.underline)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.headerStyle?.underline
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Underline size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Header Colors - Background and Text */}
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Header Background Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Background Color</label>
                                        <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.tables?.headerStyle?.backgroundColor || '#f4f4f4' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.tables?.headerStyle?.backgroundColor || '#f4f4f4'}
                                                    onChange={(e) => updateSetting('tables.headerStyle.backgroundColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.tables?.headerStyle?.backgroundColor || ''}
                                                onChange={(e) => updateSetting('tables.headerStyle.backgroundColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.tables?.headerStyle?.backgroundColor && (
                                                <button
                                                    onClick={() => updateSetting('tables.headerStyle.backgroundColor', '')}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Header Text Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Text Color</label>
                                        <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.tables?.headerStyle?.textColor || '#000000' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.tables?.headerStyle?.textColor || '#000000'}
                                                    onChange={(e) => updateSetting('tables.headerStyle.textColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.tables?.headerStyle?.textColor || ''}
                                                onChange={(e) => updateSetting('tables.headerStyle.textColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.tables?.headerStyle?.textColor && (
                                                <button
                                                    onClick={() => updateSetting('tables.headerStyle.textColor', '')}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Cells Style Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Cells Style</h3>

                                {/* Style Selector */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Style</label>
                                    <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                        <button
                                            onClick={() => updateSetting('tables.cellStyle.bold', !settings.tables?.cellStyle?.bold)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.cellStyle?.bold
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Bold size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting('tables.cellStyle.italic', !settings.tables?.cellStyle?.italic)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.cellStyle?.italic
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Italic size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateSetting('tables.cellStyle.underline', !settings.tables?.cellStyle?.underline)}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                settings.tables?.cellStyle?.underline
                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Underline size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Cells Colors - Background and Text */}
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Cells Background Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Background Color</label>
                                        <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.tables?.cellStyle?.backgroundColor || '#ffffff' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.tables?.cellStyle?.backgroundColor || '#ffffff'}
                                                    onChange={(e) => updateSetting('tables.cellStyle.backgroundColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.tables?.cellStyle?.backgroundColor || ''}
                                                onChange={(e) => updateSetting('tables.cellStyle.backgroundColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.tables?.cellStyle?.backgroundColor && (
                                                <button
                                                    onClick={() => updateSetting('tables.cellStyle.backgroundColor', '')}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Cells Text Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Text Color</label>
                                        <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.tables?.cellStyle?.textColor || '#000000' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.tables?.cellStyle?.textColor || '#000000'}
                                                    onChange={(e) => updateSetting('tables.cellStyle.textColor', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.tables?.cellStyle?.textColor || ''}
                                                onChange={(e) => updateSetting('tables.cellStyle.textColor', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.tables?.cellStyle?.textColor && (
                                                <button
                                                    onClick={() => updateSetting('tables.cellStyle.textColor', '')}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Border Section */}
                            <div className="pt-6 border-t border-border space-y-6">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Border</h3>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Border Width */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Width (pt)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="10"
                                            step="0.5"
                                            className="w-full bg-muted/50 border border-border rounded-2xl px-5 py-4 text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border"
                                            value={settings.tables?.border?.width || ''}
                                            onChange={(e) => updateSetting('tables.border.width', e.target.value)}
                                            placeholder="1"
                                        />
                                    </div>

                                    {/* Border Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Color</label>
                                        <div className="flex items-center gap-4 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                                            <div 
                                                className="h-10 w-10 shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative" 
                                                style={{ backgroundColor: settings.tables?.border?.color || '#000000' }}
                                            >
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    value={settings.tables?.border?.color || '#000000'}
                                                    onChange={(e) => updateSetting('tables.border.color', e.target.value)}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent border-none text-xs font-bold text-foreground outline-none uppercase tracking-wider"
                                                value={settings.tables?.border?.color || ''}
                                                onChange={(e) => updateSetting('tables.border.color', e.target.value)}
                                                placeholder="None"
                                            />
                                            {settings.tables?.border?.color && (
                                                <button
                                                    onClick={() => updateSetting('tables.border.color', '')}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Index/Outline Section */}
                    <section id="section-outline" className="space-y-8 scroll-mt-16">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-2xl border border-border shadow-sm">
                                <List size={22} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Index</h2>
                        </div>

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
                            {/* Enable Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-base font-semibold text-foreground">Enable index</label>
                                    <p className="text-sm text-muted-foreground">
                                        When enabled, a table of contents will be automatically generated based on your document headings.
                                    </p>
                                </div>
                                <button
                                    onClick={() => updateSetting('outline.enabled', !settings.outline?.enabled)}
                                    className={cn(
                                        "w-14 h-8 rounded-full transition-all duration-300 relative shrink-0 ml-4",
                                        settings.outline?.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full bg-background shadow-sm absolute top-1 transition-all duration-300",
                                        settings.outline?.enabled ? "left-7" : "left-1"
                                    )} />
                                </button>
                            </div>

                            {settings.outline?.enabled && (
                                <>
                                    {/* Title Settings */}
                                    <div className="pt-8 border-t border-border space-y-8">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Title</h3>
                                        
                                        <HeaderFooterPlateEditor
                                            content={settings.outline?.title?.content || ''}
                                            onChange={(value) => updateSetting('outline.title.content', value)}
                                            placeholder="Table of Contents"
                                        />
                                    </div>

                                    {/* Entries Settings */}
                                    <div className="pt-8 border-t border-border space-y-8">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Entries Settings</h3>

                                        <div className="grid grid-cols-3 gap-6">
                                            <div className="flex flex-col gap-3">
                                                <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Font Size</label>
                                                <input
                                                    type="number"
                                                    min="8"
                                                    max="36"
                                                    className="block w-20 bg-muted/50 border border-border rounded-2xl p-1 h-[42px] text-sm font-semibold text-foreground transition-all outline-none hover:bg-muted focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-border text-center"
                                                    value={parseInt(settings.outline?.entries?.fontSize || '12')}
                                                    onChange={(e) => updateSetting('outline.entries.fontSize', `${e.target.value}px`)}
                                                    placeholder="12"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Style</label>
                                                <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                                    <button
                                                        onClick={() => updateSetting('outline.entries.bold', !settings.outline?.entries?.bold)}
                                                        className={cn(
                                                            "p-2.5 rounded-xl transition-all",
                                                            settings.outline?.entries?.bold
                                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                                : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        <Bold size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => updateSetting('outline.entries.italic', !settings.outline?.entries?.italic)}
                                                        className={cn(
                                                            "p-2.5 rounded-xl transition-all",
                                                            settings.outline?.entries?.italic
                                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                                : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        <Italic size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => updateSetting('outline.entries.underline', !settings.outline?.entries?.underline)}
                                                        className={cn(
                                                            "p-2.5 rounded-xl transition-all",
                                                            settings.outline?.entries?.underline
                                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                                : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        <Underline size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Filler</label>
                                                <div className="flex gap-2 p-1 bg-muted/50 border border-border rounded-2xl w-fit">
                                                    {[
                                                        { id: 'dotted', label: 'Dotted' },
                                                        { id: 'line', label: 'Line' },
                                                        { id: 'empty', label: 'Empty' }
                                                    ].map((filler) => (
                                                        <button
                                                            key={filler.id}
                                                            onClick={() => updateSetting('outline.entries.filler', filler.id)}
                                                            className={cn(
                                                                "px-3 p-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                                                                settings.outline?.entries?.filler === filler.id
                                                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                                                    : "text-muted-foreground hover:text-foreground"
                                                            )}
                                                        >
                                                            {filler.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Empty Pages After */}
                                    <div className="flex items-center gap-4 pt-8 border-t border-border">
                                        <label className="text-sm font-medium text-foreground">Empty pages after</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={settings.outline?.emptyPagesAfter || 0}
                                            onChange={(e) => updateSetting('outline.emptyPagesAfter', Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-20 px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
                                </>
                            )}
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
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

                                    {/* Empty Pages After */}
                                    <div className="flex items-center gap-4 pt-4 border-t border-border">
                                        <label className="text-sm font-medium text-foreground">Empty pages after</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={settings.frontPage?.emptyPagesAfter || 0}
                                            onChange={(e) => updateSetting('frontPage.emptyPagesAfter', Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-20 px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
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

                        <div className="p-6 bg-card border border-border rounded-[2rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] space-y-6 ring-1 ring-border/50">
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
