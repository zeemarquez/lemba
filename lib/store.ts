import { create } from 'zustand';

interface File {
    id: string;
    name: string;
    content: string;
    language: string;
}

interface Template {
    id: string;
    name: string;
    css: string;
    settings: {
        fontFamily: string;
        fontSize: string;
        textColor: string;
        backgroundColor: string;
        pageLayout: 'vertical' | 'horizontal';
        margins: {
            top: string;
            bottom: string;
            left: string;
            right: string;
        };
        watermark?: string;
        h1: { fontSize: string; color: string; textAlign: 'left' | 'center' | 'right'; borderBottom: boolean; textTransform: 'none' | 'uppercase' | 'capitalize' };
        h2: { fontSize: string; color: string; textAlign: 'left' | 'center' | 'right'; borderBottom: boolean; textTransform: 'none' | 'uppercase' | 'capitalize' };
        header?: {
            enabled: boolean;
            content: string;
            margins: {
                top: string;
                bottom: string;
                left: string;
                right: string;
            };
        };
        footer?: {
            enabled: boolean;
            content: string;
            margins: {
                top: string;
                bottom: string;
                left: string;
                right: string;
            };
        };
    }
}

interface AppState {
    files: File[];
    activeFileId: string | null;
    openTabs: { id: string; type: 'file' | 'template' }[];
    leftSidebarExpanded: boolean;
    rightSidebarExpanded: boolean;
    sidebarView: 'explorer' | 'templates' | 'settings';
    currentView: 'file' | 'template';
    templates: Template[];
    activeTemplateId: string | null;
    activeTemplateCss: string;
    editorViewMode: 'source' | 'editing' | 'viewing' | 'suggestion';

    // Actions
    addFile: (file: File) => void;
    updateFileContent: (id: string, content: string) => void;
    openFile: (id: string) => void;
    openTemplate: (id: string) => void;
    closeTab: (id: string) => void;
    toggleLeftSidebar: () => void;
    toggleRightSidebar: () => void;
    setSidebarView: (view: 'explorer' | 'templates' | 'settings') => void;
    setRightSidebarOpen: (isOpen: boolean) => void;
    addTemplate: (template: Template) => void;
    updateTemplate: (id: string, updates: Partial<Template>) => void;
    updateTemplateCss: (id: string, css: string) => void;
    setActiveTemplate: (id: string) => void;
    setActiveTemplateCss: (css: string) => void;
    setEditorViewMode: (mode: 'source' | 'editing' | 'viewing' | 'suggestion') => void;
}

export const useStore = create<AppState>((set) => ({
    files: [
        {
            id: '1',
            name: 'Welcome.md',
            content: '# Welcome to Modern Markdown Editor\n\nIdentical to Obsidian, but better.\n\nStart typing...',
            language: 'markdown'
        }
    ],
    activeFileId: '1',
    openTabs: [{ id: '1', type: 'file' }],
    leftSidebarExpanded: true,
    rightSidebarExpanded: true,
    sidebarView: 'explorer',
    templates: [
        {
            id: 'default',
            name: 'Default',
            css: '',
            settings: {
                fontFamily: 'Inter, sans-serif',
                fontSize: '16px',
                textColor: '#000000',
                backgroundColor: '#ffffff',
                pageLayout: 'vertical',
                margins: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
                h1: { fontSize: '2.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                h2: { fontSize: '2em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                header: { enabled: false, content: '', margins: { top: '0mm', bottom: '5mm', left: '0mm', right: '0mm' } },
                footer: { enabled: false, content: '', margins: { top: '5mm', bottom: '0mm', left: '0mm', right: '0mm' } },
            }
        },
        {
            id: 'academic',
            name: 'Academic',
            css: '',
            settings: {
                fontFamily: 'Times New Roman, serif',
                fontSize: '12pt',
                textColor: '#000000',
                backgroundColor: '#ffffff',
                pageLayout: 'vertical',
                margins: { top: '25mm', bottom: '25mm', left: '25mm', right: '25mm' },
                h1: { fontSize: '18pt', color: '#000000', textAlign: 'center', borderBottom: true, textTransform: 'uppercase' },
                h2: { fontSize: '14pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                header: { enabled: true, content: 'Header', margins: { top: '0mm', bottom: '5mm', left: '0mm', right: '0mm' } },
                footer: { enabled: true, content: 'Page {page}', margins: { top: '5mm', bottom: '0mm', left: '0mm', right: '0mm' } },
            }
        },
        {
            id: 'minimal',
            name: 'Minimal',
            css: '',
            settings: {
                fontFamily: 'system-ui, sans-serif',
                fontSize: '16px',
                textColor: '#333333',
                backgroundColor: '#fafafa',
                pageLayout: 'vertical',
                margins: { top: '30mm', bottom: '30mm', left: '30mm', right: '30mm' },
                h1: { fontSize: '2em', color: '#111111', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                h2: { fontSize: '1.5em', color: '#222222', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                header: { enabled: false, content: '', margins: { top: '0mm', bottom: '5mm', left: '0mm', right: '0mm' } },
                footer: { enabled: false, content: '', margins: { top: '5mm', bottom: '0mm', left: '0mm', right: '0mm' } },
            }
        },
    ],
    activeTemplateId: 'default',
    activeTemplateCss: '',
    editorViewMode: 'editing',
    currentView: 'file', // Default view

    addFile: (file) => set((state) => ({ files: [...state.files, file] })),

    updateFileContent: (id, content) => set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, content } : f))
    })),

    openFile: (id) => set((state) => {
        if (!state.openTabs.some(tab => tab.id === id && tab.type === 'file')) {
            return {
                activeFileId: id,
                currentView: 'file',
                openTabs: [...state.openTabs, { id, type: 'file' }]
            };
        }
        return { activeFileId: id, currentView: 'file' };
    }),

    openTemplate: (id) => set((state) => {
        const template = state.templates.find(t => t.id === id);
        if (!state.openTabs.some(tab => tab.id === id && tab.type === 'template')) {
            return {
                activeTemplateId: id,
                activeTemplateCss: template ? template.css : state.activeTemplateCss,
                currentView: 'template',
                openTabs: [...state.openTabs, { id, type: 'template' }],
            };
        }
        return {
            activeTemplateId: id,
            activeTemplateCss: template ? template.css : state.activeTemplateCss,
            currentView: 'template'
        };
    }),

    closeTab: (id) => set((state) => {
        // Find the tab to be removed
        const tabIndex = state.openTabs.findIndex(t => t.id === id);
        if (tabIndex === -1) return {};

        const tabToRemove = state.openTabs[tabIndex];
        const newTabs = state.openTabs.filter(t => t.id !== id);

        // If we are closing the currently active tab (based on currentView and ID)
        const isClosingActive =
            (state.currentView === 'file' && state.activeFileId === id && tabToRemove.type === 'file') ||
            (state.currentView === 'template' && state.activeTemplateId === id && tabToRemove.type === 'template');

        if (!isClosingActive) {
            return { openTabs: newTabs };
        }

        // Determine next active tab
        let nextTab = null;
        if (newTabs.length > 0) {
            // Try to select the tab to the right, or the one to the left if right doesn't exist
            nextTab = newTabs[tabIndex] || newTabs[tabIndex - 1];
        }

        if (nextTab) {
            if (nextTab.type === 'file') {
                return {
                    openTabs: newTabs,
                    activeFileId: nextTab.id,
                    currentView: 'file'
                };
            } else {
                return {
                    openTabs: newTabs,
                    activeTemplateId: nextTab.id,
                    currentView: 'template',
                    // Update CSS using a fresh lookup since we might be switching back to an old template tab
                    activeTemplateCss: state.templates.find(t => t.id === nextTab.id)?.css || state.activeTemplateCss
                };
            }
        } else {
            // No tabs left
            return {
                openTabs: newTabs,
                activeFileId: null,
                // We don't clear activeTemplateId because it might be used for export sidebar even if no tabs open?
                // But for consistency let's leave it. The User only asked to fix the tab overriding issue.
                // However, currentView needs to be something. 
                // If no tabs, maybe 'file' by default but with null ID?
                currentView: 'file'
            };
        }
    }),

    toggleLeftSidebar: () => set((state) => ({ leftSidebarExpanded: !state.leftSidebarExpanded })),
    toggleRightSidebar: () => set((state) => ({ rightSidebarExpanded: !state.rightSidebarExpanded })),
    setSidebarView: (view) => set({ sidebarView: view }),
    setRightSidebarOpen: (isOpen) => set({ rightSidebarExpanded: isOpen }),
    addTemplate: (template) => set((state) => ({ templates: [...state.templates, template] })),
    updateTemplate: (id, updates) => set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),
    updateTemplateCss: (id, css) => set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? { ...t, css } : t)),
        activeTemplateCss: state.activeTemplateId === id ? css : state.activeTemplateCss
    })),
    setActiveTemplate: (id) => set((state) => {
        const template = state.templates.find(t => t.id === id);
        return {
            activeTemplateId: id,
            activeTemplateCss: template ? template.css : state.activeTemplateCss
        };
    }),
    setActiveTemplateCss: (css: string) => set({ activeTemplateCss: css }),
    setEditorViewMode: (editorViewMode) => set({ editorViewMode }),
}));
