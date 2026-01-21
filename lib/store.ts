import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserStorage, FontEntry } from './browser-storage';

export interface FileNode {
    id: string; // relative path
    name: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

export interface AppStateFile {
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
    fontStyle: string;
    textDecoration: string;
    numbering: {
        enabled: boolean;
        style: 'decimal' | 'decimal-leading-zero' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';
        separator: string;
        prefix: string;
        suffix: string;
    };
}

// Document variable definition (name only, value is per-document)
export interface TemplateVariable {
    id: string;
    name: string;
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
        startPageNumber?: number;
        watermark?: string;
        variables?: TemplateVariable[];
        h1: HeadingStyle;
        h2: HeadingStyle;
        h3: HeadingStyle;
        h4: HeadingStyle;
        h5: HeadingStyle;
        h6: HeadingStyle;
        header?: {
            enabled: boolean;
            content: string;
            startPage: number;
            margins: {
                bottom: string;
                left: string;
                right: string;
            };
        };
        footer?: {
            enabled: boolean;
            content: string;
            startPage: number;
            margins: {
                top: string;
                left: string;
                right: string;
            };
        };
        frontPage?: {
            enabled: boolean;
            content: string;
            emptyPagesAfter?: number;
        };
        codeBlockTheme?: string;
        tables?: {
            preventPageBreak: boolean;
            headerStyle?: {
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                backgroundColor?: string;
                textColor?: string;
            };
            cellStyle?: {
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                backgroundColor?: string;
                textColor?: string;
            };
            border?: {
                width?: string;
                color?: string;
            };
        };
        outline?: {
            enabled: boolean;
            title?: {
                content: string;
            };
            entries?: {
                fontSize: string;
                bold: boolean;
                italic: boolean;
                underline: boolean;
                filler: 'dotted' | 'line' | 'empty';
            };
            emptyPagesAfter?: number;
        };
    }
}

interface AppState {
    // File System State
    fileTree: FileNode[];
    isLoadingFileTree: boolean;

    // Editor State
    files: AppStateFile[]; // Cache of loaded files
    activeFileId: string | null;
    openTabs: { id: string; type: 'file' | 'template' }[];

    // UI State
    leftSidebarExpanded: boolean;
    rightSidebarExpanded: boolean;
    sidebarView: 'explorer' | 'templates';
    currentView: 'file' | 'template';
    isSettingsOpen: boolean;
    editorViewMode: 'source' | 'editing' | 'viewing' | 'suggestion';
    uiIconSize: 'small' | 'normal' | 'big';
    uiFontSize: 'small' | 'normal' | 'big';
    showOutline: boolean;

    // Export Settings
    previewQuality: 'low' | 'medium' | 'high';

    // Source Editor Settings
    sourceEditorFontFamily: string;
    sourceEditorFontSize: number;

    // Templates State
    templates: Template[];
    activeTemplateId: string | null;
    activeTemplateCss: string;

    // Fonts State
    customFonts: FontEntry[];

    // Actions
    fetchFileTree: () => Promise<void>;
    fetchTemplates: () => Promise<void>;
    fetchFonts: () => Promise<void>;
    restoreSession: () => Promise<void>;

    createFile: (path: string, content?: string) => Promise<void>;
    createFolder: (path: string) => Promise<void>;

    // Template Actions
    createTemplate: (path: string, template: Template) => Promise<void>;
    saveTemplate: (path: string, template: Template) => Promise<void>;

    deleteItem: (path: string, type: 'file' | 'folder') => Promise<void>;
    renameItem: (oldPath: string, newPath: string) => Promise<void>;
    moveItem: (sourcePath: string, destinationPath: string) => Promise<void>;

    // Font Actions
    addFont: (family: string, file: File) => Promise<void>;
    deleteFont: (id: string) => Promise<void>;

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
    setPreviewQuality: (quality: 'low' | 'medium' | 'high') => void;
    setUiIconSize: (size: 'small' | 'normal' | 'big') => void;
    setUiFontSize: (size: 'small' | 'normal' | 'big') => void;
    setShowOutline: (show: boolean) => void;
    setSourceEditorFontFamily: (fontFamily: string) => void;
    setSourceEditorFontSize: (fontSize: number) => void;

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
        startPageNumber: 1,
        h1: { fontSize: '40px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '700', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        h2: { fontSize: '32px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        h3: { fontSize: '24px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        h4: { fontSize: '20px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        h5: { fontSize: '18px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        h6: { fontSize: '16px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', fontStyle: 'normal', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
        header: { enabled: false, content: '', startPage: 1, margins: { bottom: '5mm', left: '0mm', right: '0mm' } },
        footer: { enabled: false, content: '', startPage: 1, margins: { top: '5mm', left: '0mm', right: '0mm' } },
        frontPage: { enabled: false, content: '' },
        tables: { preventPageBreak: false, headerStyle: { bold: true, backgroundColor: '' } },
        outline: { 
            enabled: false,
            title: {
                content: '',
            },
            entries: {
                fontSize: '12px',
                bold: false,
                italic: false,
                underline: false,
                filler: 'dotted',
            },
        },
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
                customFonts: [],
                editorViewMode: 'editing',
                currentView: 'file',
                isSettingsOpen: false,
                previewQuality: 'medium',
                uiIconSize: 'normal',
                uiFontSize: 'normal',
                showOutline: true,
                sourceEditorFontFamily: 'monospace',
                sourceEditorFontSize: 14,

                // Actions implementation
                fetchFileTree: async () => {
                    set({ isLoadingFileTree: true });
                    try {
                        let { tree } = await browserStorage.list();
                        
                        // Check if Files folder has any files
                        const filesRoot = tree.find(n => n.name === 'Files');
                        const hasFiles = filesRoot?.children && filesRoot.children.length > 0;
                        
                        // If no files exist, load the default showcase file from /default/
                        if (!hasFiles) {
                            try {
                                const response = await fetch('/default/Lorem Ipsum.md');
                                if (response.ok) {
                                    const content = await response.text();
                                    const path = 'Files/Lorem Ipsum.md';
                                    await browserStorage.createFile(path, content);
                                    // Re-fetch tree after creating default file
                                    const result = await browserStorage.list();
                                    tree = result.tree;
                                    // Open the default file
                                    setTimeout(() => get().openFile(path), 100);
                                }
                            } catch (err) {
                                console.error('Failed to load default showcase file:', err);
                            }
                        }
                        
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
                                // Try to fetch the default template from /default/ folder
                                const response = await fetch('/default/Default.mdt');
                                if (response.ok) {
                                    const templateData = await response.json();
                                    // Update the id to match the storage path
                                    templateData.id = path;
                                    await browserStorage.createTemplate(path, templateData);
                                } else {
                                    // Fallback to hardcoded DEFAULT_TEMPLATE if fetch fails
                                    await browserStorage.createTemplate(path, { ...DEFAULT_TEMPLATE, id: path });
                                }

                                // Re-fetch to get the file with correct metadata
                                templates = await browserStorage.listTemplates();

                                // Trigger file tree refresh so it shows in sidebar
                                get().fetchFileTree();
                            } catch (err) {
                                console.error('Failed to create default template:', err);
                                // Fallback to hardcoded DEFAULT_TEMPLATE
                                try {
                                    await browserStorage.createTemplate(path, { ...DEFAULT_TEMPLATE, id: path });
                                    templates = await browserStorage.listTemplates();
                                    get().fetchFileTree();
                                } catch (fallbackErr) {
                                    console.error('Failed to create fallback template:', fallbackErr);
                                }
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

                fetchFonts: async () => {
                    try {
                        const fonts = await browserStorage.listFonts();
                        set({ customFonts: fonts });
                    } catch (error) {
                        console.error('Failed to fetch fonts:', error);
                    }
                },

                restoreSession: async () => {
                    const { openTabs, files } = get();
                    const newFiles = [...files];
                    let hasUpdates = false;

                    for (const tab of openTabs) {
                        if (tab.type === 'file') {
                            const isLoaded = newFiles.some(f => f.id === tab.id);
                            if (!isLoaded) {
                                try {
                                    const content = await browserStorage.readFile(tab.id);
                                    newFiles.push({
                                        id: tab.id,
                                        name: tab.id.split('/').pop() || tab.id,
                                        content,
                                        language: 'markdown'
                                    });
                                    hasUpdates = true;
                                } catch (error) {
                                    console.error('Failed to restore file:', tab.id, error);
                                }
                            }
                        }
                    }

                    if (hasUpdates) {
                        set({ files: newFiles });
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

                addFont: async (family, file) => {
                    try {
                        await browserStorage.storeFont(family, file);
                        await get().fetchFonts();
                    } catch (error) {
                        console.error('Failed to add font:', error);
                    }
                },

                deleteFont: async (id) => {
                    try {
                        await browserStorage.deleteFont(id);
                        await get().fetchFonts();
                    } catch (error) {
                        console.error('Failed to delete font:', error);
                    }
                },

                openFile: async (path: string) => {
                    const { files, openTabs } = get();
                    const existingFile = files.find(f => f.id === path);

                    if (!existingFile) {
                        try {
                            const content = await browserStorage.readFile(path);
                            const newFile: AppStateFile = {
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
                setPreviewQuality: (quality) => set({ previewQuality: quality }),
                setUiIconSize: (size) => set({ uiIconSize: size }),
                setUiFontSize: (size) => set({ uiFontSize: size }),
                setShowOutline: (show) => set({ showOutline: show }),
                setSourceEditorFontFamily: (fontFamily) => set({ sourceEditorFontFamily: fontFamily }),
                setSourceEditorFontSize: (fontSize) => set({ sourceEditorFontSize: fontSize }),
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
                previewQuality: state.previewQuality,
                uiIconSize: state.uiIconSize,
                uiFontSize: state.uiFontSize,
                showOutline: state.showOutline,
                sourceEditorFontFamily: state.sourceEditorFontFamily,
                sourceEditorFontSize: state.sourceEditorFontSize,
                activeFileId: state.activeFileId,
                activeTemplateId: state.activeTemplateId,
                openTabs: state.openTabs,
                sidebarView: state.sidebarView,
                currentView: state.currentView,
                editorViewMode: state.editorViewMode,
                // Do not persist files content to avoid issues
            })
        }
    )
);
