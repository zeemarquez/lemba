import { create } from 'zustand';

export interface FileNode {
    id: string; // relative path
    name: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

export interface File {
    id: string; // relative path
    name: string;
    content: string;
    language: string;
}

interface HeadingStyle {
    fontSize: string;
    color: string;
    textAlign: 'left' | 'center' | 'right';
    borderBottom: boolean;
    textTransform: 'none' | 'uppercase' | 'capitalize';
    fontWeight: string;
    textDecoration: string;
    numbering: {
        enabled: boolean;
        style: 'decimal' | 'decimal-leading-zero' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';
        separator: string;
        prefix: string;
        suffix: string;
    };
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
        h1: HeadingStyle;
        h2: HeadingStyle;
        h3: HeadingStyle;
        h4: HeadingStyle;
        h5: HeadingStyle;
        h6: HeadingStyle;
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
        codeBlockTheme?: string;
    }
}

interface AppState {
    // File System State
    fileTree: FileNode[];
    storagePath: string;
    isLoadingFileTree: boolean;
    
    // Editor State
    files: File[]; // Cache of loaded files
    activeFileId: string | null;
    openTabs: { id: string; type: 'file' | 'template' }[];
    
    // UI State
    leftSidebarExpanded: boolean;
    rightSidebarExpanded: boolean;
    sidebarView: 'explorer' | 'templates';
    currentView: 'file' | 'template';
    isSettingsOpen: boolean;
    editorViewMode: 'source' | 'editing' | 'viewing' | 'suggestion';

    // Templates State
    templates: Template[];
    activeTemplateId: string | null;
    activeTemplateCss: string;

    // Actions
    fetchFileTree: () => Promise<void>;
    fetchStoragePath: () => Promise<void>;
    updateStoragePath: (path: string) => Promise<void>;
    
    createFile: (path: string, content?: string) => Promise<void>;
    createFolder: (path: string) => Promise<void>;
    deleteItem: (path: string, type: 'file' | 'folder') => Promise<void>;
    
    // Opens a file, fetching content if needed
    openFile: (path: string) => Promise<void>;
    saveFile: (path: string, content: string) => Promise<void>;
    
    // Legacy/UI Actions
    closeTab: (id: string) => void;
    toggleLeftSidebar: () => void;
    toggleRightSidebar: () => void;
    setSidebarView: (view: 'explorer' | 'templates') => void;
    setRightSidebarOpen: (isOpen: boolean) => void;
    setSettingsOpen: (isOpen: boolean) => void;
    
    addTemplate: (template: Template) => void;
    updateTemplate: (id: string, updates: Partial<Template>) => void;
    updateTemplateCss: (id: string, css: string) => void;
    setActiveTemplate: (id: string) => void;
    setActiveTemplateCss: (css: string) => void;
    setEditorViewMode: (mode: 'source' | 'editing' | 'viewing' | 'suggestion') => void;
    
    // Helper to update local file content state (for editor changes before save)
    updateFileContent: (id: string, content: string) => void;
}

const defaultTemplates: Template[] = [
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
            h1: { fontSize: '2.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '700', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h2: { fontSize: '2em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h3: { fontSize: '1.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h4: { fontSize: '1.25em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h5: { fontSize: '1.1em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h6: { fontSize: '1em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
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
            h1: { fontSize: '18pt', color: '#000000', textAlign: 'center', borderBottom: true, textTransform: 'uppercase', fontWeight: '700', textDecoration: 'none', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h2: { fontSize: '14pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h3: { fontSize: '12pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h4: { fontSize: '12pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'italic', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h5: { fontSize: '12pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '400', textDecoration: 'none', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h6: { fontSize: '12pt', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '400', textDecoration: 'italic', numbering: { enabled: true, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
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
            h1: { fontSize: '2em', color: '#111111', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '800', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h2: { fontSize: '1.5em', color: '#222222', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '700', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h3: { fontSize: '1.25em', color: '#333333', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h4: { fontSize: '1.1em', color: '#444444', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h5: { fontSize: '1em', color: '#555555', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            h6: { fontSize: '1em', color: '#666666', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '500', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
            header: { enabled: false, content: '', margins: { top: '0mm', bottom: '5mm', left: '0mm', right: '0mm' } },
            footer: { enabled: false, content: '', margins: { top: '5mm', bottom: '0mm', left: '0mm', right: '0mm' } },
        }
    },
];

export const useStore = create<AppState>((set, get) => ({
    // Initial State
    fileTree: [],
    storagePath: '',
    isLoadingFileTree: false,
    files: [],
    activeFileId: null,
    openTabs: [],
    leftSidebarExpanded: true,
    rightSidebarExpanded: true,
    sidebarView: 'explorer',
    templates: defaultTemplates,
    activeTemplateId: 'default',
    activeTemplateCss: '',
    editorViewMode: 'editing',
    currentView: 'file',
    isSettingsOpen: false,

    // Actions implementation
    fetchFileTree: async () => {
        set({ isLoadingFileTree: true });
        try {
            const res = await fetch('/api/fs/list');
            const data = await res.json();
            if (data.tree) {
                set({ fileTree: data.tree });
            }
        } catch (error) {
            console.error('Failed to fetch file tree:', error);
        } finally {
            set({ isLoadingFileTree: false });
        }
    },

    fetchStoragePath: async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.storagePath) {
                set({ storagePath: data.storagePath });
            }
        } catch (error) {
            console.error('Failed to fetch storage path:', error);
        }
    },

    updateStoragePath: async (path: string) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storagePath: path })
            });
            const data = await res.json();
            if (data.success) {
                set({ storagePath: path });
                get().fetchFileTree();
            }
        } catch (error) {
            console.error('Failed to update storage path:', error);
        }
    },

    createFile: async (path: string, content = '') => {
        try {
            const res = await fetch('/api/fs/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });
            if (res.ok) {
                await get().fetchFileTree();
                await get().openFile(path);
            }
        } catch (error) {
            console.error('Failed to create file:', error);
        }
    },

    createFolder: async (path: string) => {
        try {
            const res = await fetch('/api/fs/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            if (res.ok) {
                await get().fetchFileTree();
            }
        } catch (error) {
            console.error('Failed to create folder:', error);
        }
    },

    deleteItem: async (path: string, type: 'file' | 'folder') => {
        try {
            const endpoint = type === 'file' ? '/api/fs/file' : '/api/fs/folder';
            const res = await fetch(`${endpoint}?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                await get().fetchFileTree();
                // Close tab if open
                const { openTabs, activeFileId, activeTemplateId } = get();
                if (type === 'file' && openTabs.some(t => t.id === path)) {
                    get().closeTab(path);
                }
            }
        } catch (error) {
            console.error('Failed to delete item:', error);
        }
    },

    openFile: async (path: string) => {
        const { files, openTabs } = get();
        const existingFile = files.find(f => f.id === path);

        // If file content not loaded, fetch it
        if (!existingFile) {
            try {
                const res = await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                if (data.content !== undefined) {
                    const newFile: File = {
                        id: path,
                        name: path.split('/').pop() || path,
                        content: data.content,
                        language: 'markdown'
                    };
                    set(state => ({ files: [...state.files, newFile] }));
                } else {
                    console.error('Failed to load file content');
                    return;
                }
            } catch (error) {
                console.error('Failed to fetch file content:', error);
                return;
            }
        }

        // Add to open tabs if not present
        if (!openTabs.some(tab => tab.id === path && tab.type === 'file')) {
            set(state => ({
                activeFileId: path,
                currentView: 'file',
                openTabs: [...state.openTabs, { id: path, type: 'file' }]
            }));
        } else {
            set({ activeFileId: path, currentView: 'file' });
        }
    },

    saveFile: async (path: string, content: string) => {
        try {
            await fetch('/api/fs/file', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });
            // Update local state is handled by updateFileContent, but good to ensure consistency
        } catch (error) {
            console.error('Failed to save file:', error);
        }
    },

    updateFileContent: (id, content) => set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, content } : f))
    })),

    // ... legacy actions (simplified/preserved) ...
    closeTab: (id) => set((state) => {
        const tabIndex = state.openTabs.findIndex(t => t.id === id);
        if (tabIndex === -1) return {};

        const tabToRemove = state.openTabs[tabIndex];
        const newTabs = state.openTabs.filter(t => t.id !== id);

        const isClosingActive =
            (state.currentView === 'file' && state.activeFileId === id && tabToRemove.type === 'file') ||
            (state.currentView === 'template' && state.activeTemplateId === id && tabToRemove.type === 'template');

        if (!isClosingActive) {
            return { openTabs: newTabs };
        }

        let nextTab = null;
        if (newTabs.length > 0) {
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
                    activeTemplateCss: state.templates.find(t => t.id === nextTab.id)?.css || state.activeTemplateCss
                };
            }
        } else {
            return {
                openTabs: newTabs,
                activeFileId: null,
                currentView: 'file'
            };
        }
    }),

    toggleLeftSidebar: () => set((state) => ({ leftSidebarExpanded: !state.leftSidebarExpanded })),
    toggleRightSidebar: () => set((state) => ({ rightSidebarExpanded: !state.rightSidebarExpanded })),
    setSidebarView: (view) => set({ sidebarView: view }),
    setRightSidebarOpen: (isOpen) => set({ rightSidebarExpanded: isOpen }),
    setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
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
}));
