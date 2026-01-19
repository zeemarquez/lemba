import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserStorage } from './browser-storage';

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

export interface Template {
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
    fetchTemplates: () => Promise<void>;
    
    createFile: (path: string, content?: string) => Promise<void>;
    createFolder: (path: string) => Promise<void>;
    
    // Template Actions
    createTemplate: (path: string, template: Template) => Promise<void>;
    saveTemplate: (path: string, template: Template) => Promise<void>;
    
    deleteItem: (path: string, type: 'file' | 'folder') => Promise<void>;
    renameItem: (oldPath: string, newPath: string) => Promise<void>;
    moveItem: (sourcePath: string, destinationPath: string) => Promise<void>;

    // Opens a file, fetching content if needed
    openFile: (path: string) => Promise<void>;
    saveFile: (path: string, content: string) => Promise<void>;
    openTemplate: (id: string) => void;
    
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

const DEFAULT_TEMPLATE: Template = {
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
};

export const useStore = create<AppState>()(
    persist(
        (set, get) => {
            return {
                // Initial State
                fileTree: [],
                isLoadingFileTree: false,
                files: [],
                activeFileId: null,
                openTabs: [],
                leftSidebarExpanded: true,
                rightSidebarExpanded: true,
                sidebarView: 'explorer',
                templates: [],
                activeTemplateId: null,
                activeTemplateCss: '',
                editorViewMode: 'editing',
                currentView: 'file',
                isSettingsOpen: false,

                // Actions implementation
                fetchFileTree: async () => {
                    set({ isLoadingFileTree: true });
                    try {
                        const { tree } = await browserStorage.list();
                        set({ fileTree: tree });
                    } catch (error) {
                        console.error('Failed to fetch file tree:', error);
                    } finally {
                        set({ isLoadingFileTree: false });
                    }
                },

                fetchTemplates: async () => {
                    try {
                        let templates = await browserStorage.listTemplates();
                        
                        // Check if Default template exists
                        const defaultExists = templates.some(t => t.name === 'Default');
                        
                        if (!defaultExists) {
                             const path = 'Templates/Default.mdt';
                             try {
                                 // Create the default template file
                                 await browserStorage.createTemplate(path, { ...DEFAULT_TEMPLATE, id: path });
                                 
                                 // Re-fetch to get the file with correct metadata
                                 templates = await browserStorage.listTemplates();
                                 
                                 // Trigger file tree refresh so it shows in sidebar
                                 get().fetchFileTree();
                             } catch (err) {
                                 console.error('Failed to create default template:', err);
                             }
                        }

                        set({ templates });
                        
                        // Set active template if needed
                        const state = get();
                        if ((!state.activeTemplateId || state.activeTemplateId === 'default') && templates.length > 0) {
                             const defaultT = templates.find(t => t.name === 'Default') || templates[0];
                             set({ 
                                 activeTemplateId: defaultT.id,
                                 activeTemplateCss: defaultT.css 
                             });
                        }
                    } catch (error) {
                        console.error('Failed to fetch templates:', error);
                    }
                },

                createFile: async (path: string, content = '') => {
                    try {
                        await browserStorage.createFile(path, content);
                        await get().fetchFileTree();
                        await get().openFile(path);
                    } catch (error) {
                        console.error('Failed to create file:', error);
                    }
                },

                createFolder: async (path: string) => {
                    try {
                        await browserStorage.createFolder(path);
                        await get().fetchFileTree();
                    } catch (error) {
                        console.error('Failed to create folder:', error);
                    }
                },

                createTemplate: async (path: string, template: Template) => {
                    try {
                        await browserStorage.createTemplate(path, template);
                        await get().fetchFileTree();
                        await get().fetchTemplates();
                        get().openTemplate(path);
                    } catch (error) {
                        console.error('Failed to create template:', error);
                    }
                },

                saveTemplate: async (path: string, template: Template) => {
                    try {
                        await browserStorage.saveTemplate(path, template);
                        set((state) => ({
                            templates: state.templates.map((t) => (t.id === path ? template : t))
                        }));
                    } catch (error) {
                        console.error('Failed to save template:', error);
                    }
                },

                deleteItem: async (path: string, type: 'file' | 'folder') => {
                    try {
                        await browserStorage.delete(path, type);
                        await get().fetchFileTree();
                        
                        const { openTabs } = get();
                        if (type === 'file' && openTabs.some(t => t.id === path)) {
                            get().closeTab(path);
                        }
                        if (path.startsWith('Templates/')) {
                            get().fetchTemplates();
                        }
                    } catch (error) {
                        console.error('Failed to delete item:', error);
                    }
                },

                renameItem: async (oldPath: string, newPath: string) => {
                    try {
                        await browserStorage.rename(oldPath, newPath);
                        await get().fetchFileTree();
                        if (newPath.startsWith('Templates/') || oldPath.startsWith('Templates/')) {
                            get().fetchTemplates();
                        }
                    } catch (error) {
                        console.error('Failed to rename item:', error);
                    }
                },

                moveItem: async (sourcePath: string, destinationPath: string) => {
                    try {
                        await browserStorage.move(sourcePath, destinationPath);
                        await get().fetchFileTree();
                        if (destinationPath.startsWith('Templates/') || sourcePath.startsWith('Templates/')) {
                            get().fetchTemplates();
                        }
                    } catch (error) {
                        console.error('Failed to move item:', error);
                    }
                },

                openFile: async (path: string) => {
                    const { files, openTabs } = get();
                    const existingFile = files.find(f => f.id === path);

                    if (!existingFile) {
                        try {
                            const content = await browserStorage.readFile(path);
                            const newFile: File = {
                                id: path,
                                name: path.split('/').pop() || path,
                                content: content,
                                language: 'markdown'
                            };
                            set(state => ({ files: [...state.files, newFile] }));
                        } catch (error) {
                            console.error('Failed to fetch file content:', error);
                            return;
                        }
                    }

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
                        await browserStorage.writeFile(path, content);
                    } catch (error) {
                        console.error('Failed to save file:', error);
                    }
                },

                updateFileContent: (id, content) => set((state) => ({
                    files: state.files.map((f) => (f.id === id ? { ...f, content } : f))
                })),

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
            };
        },
        {
            name: 'markdown-editor-storage', // key for localStorage
            partialize: (state) => ({
                leftSidebarExpanded: state.leftSidebarExpanded,
                rightSidebarExpanded: state.rightSidebarExpanded,
                // Do not persist openTabs or files content to avoid issues
            })
        }
    )
);
