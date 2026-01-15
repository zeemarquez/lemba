import { create } from 'zustand';

interface File {
    id: string;
    name: string;
    content: string;
    language: string;
}

interface AppState {
    files: File[];
    activeFileId: string | null;
    openTabs: string[]; // array of file IDs
    leftSidebarExpanded: boolean;
    rightSidebarExpanded: boolean;
    sidebarView: 'explorer' | 'templates' | 'settings';
    activeTemplateCss: string;
    editorViewMode: 'source' | 'editing' | 'viewing' | 'suggestion';

    // Actions
    addFile: (file: File) => void;
    updateFileContent: (id: string, content: string) => void;
    openFile: (id: string) => void;
    closeTab: (id: string) => void;
    toggleLeftSidebar: () => void;
    toggleRightSidebar: () => void;
    setSidebarView: (view: 'explorer' | 'templates' | 'settings') => void;
    setRightSidebarOpen: (isOpen: boolean) => void;
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
    openTabs: ['1'],
    leftSidebarExpanded: true,
    rightSidebarExpanded: true,
    sidebarView: 'explorer',
    activeTemplateCss: '',
    editorViewMode: 'editing',

    addFile: (file) => set((state) => ({ files: [...state.files, file] })),

    updateFileContent: (id, content) => set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, content } : f))
    })),

    openFile: (id) => set((state) => {
        if (!state.openTabs.includes(id)) {
            return { activeFileId: id, openTabs: [...state.openTabs, id] };
        }
        return { activeFileId: id };
    }),

    closeTab: (id) => set((state) => {
        const newTabs = state.openTabs.filter((tabId) => tabId !== id);
        let newActiveId = state.activeFileId;

        if (state.activeFileId === id) {
            newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
        }

        return { openTabs: newTabs, activeFileId: newActiveId };
    }),

    toggleLeftSidebar: () => set((state) => ({ leftSidebarExpanded: !state.leftSidebarExpanded })),
    toggleRightSidebar: () => set((state) => ({ rightSidebarExpanded: !state.rightSidebarExpanded })),
    setSidebarView: (view) => set({ sidebarView: view }),
    setRightSidebarOpen: (isOpen) => set({ rightSidebarExpanded: isOpen }),
    setActiveTemplateCss: (css: string) => set({ activeTemplateCss: css }),
    setEditorViewMode: (editorViewMode) => set({ editorViewMode }),
}));
