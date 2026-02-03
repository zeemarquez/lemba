import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserStorage } from './browser-storage';
import { FileNode, AppStateFile, Template, TemplateVariable, FontEntry, RagDocument, generateSyncId } from './types';
import { syncService, syncQueue } from './sync';
import { PRELOADED_FONTS } from './preloaded-fonts';
import { AgentMessage, DocumentDiff, AgentChat, createMessage, applyDiff as applyDiffToContent, mergeDiffsForFile, sendMessageToAI, runOrchestration, generateId, modelToProvider, isTrialOnlyOpenAI, TRIAL_MODEL } from './agent';
import type { LLMProvider } from './agent';
import { agentLog } from './agent/debug';
import { saveBackupBeforeApply } from './content-backup';
export type { FileNode, AppStateFile, Template, TemplateVariable, FontEntry, RagDocument };
export type { AgentMessage, DocumentDiff, AgentChat };



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
    exportWindowOpen: boolean;
    sidebarView: 'explorer' | 'templates' | 'agent';
    currentView: 'file' | 'template';
    isSettingsOpen: boolean;
    editorViewMode: 'source' | 'editing' | 'viewing' | 'suggestion';
    uiIconSize: 'small' | 'normal' | 'big';
    uiFontSize: 'small' | 'normal' | 'big';
    showOutline: boolean;
    activeHeadingId: string | null;

    // Agent State (multiple chats)
    chats: Record<string, AgentChat>;
    activeChatId: string | null;
    agentMessages: AgentMessage[];
    pendingDiffs: Record<string, DocumentDiff>;
    agentMentionedFiles: string[];
    agentLoading: boolean;
    /** Current orchestration step label (e.g. "Researching") when agentLoading and using orchestration */
    agentCurrentStep: string | null;
    agentError: string | null;
    agentProvider: LLMProvider;
    agentModel: string;
    agentReadOnly: boolean;
    /** API keys per provider (empty string = not set) */
    agentApiKeys: Record<LLMProvider, string>;
    /** Validity per provider (only true after successful validation in settings) */
    agentProviderKeysValid: Record<LLMProvider, boolean>;
    agentTemperature: number;
    agentMaxTokens: number;
    agentUseOrchestration: boolean; // Enable multi-agent orchestration mode
    ragDocuments: RagDocument[]; // Documents attached to the current chat

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
    fontsLoaded: boolean; // True after fonts have been fetched from IndexedDB (even if empty)

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
    setSidebarView: (view: 'explorer' | 'templates' | 'agent') => void;
    setRightSidebarOpen: (isOpen: boolean) => void;
    setExportWindowOpen: (isOpen: boolean) => void;
    setSettingsOpen: (isOpen: boolean) => void;
    setPreviewQuality: (quality: 'low' | 'medium' | 'high') => void;
    setUiIconSize: (size: 'small' | 'normal' | 'big') => void;
    setUiFontSize: (size: 'small' | 'normal' | 'big') => void;
    setShowOutline: (show: boolean) => void;
    setActiveHeadingId: (headingId: string | null) => void;
    setSourceEditorFontFamily: (fontFamily: string) => void;
    setSourceEditorFontSize: (fontSize: number) => void;

    // Agent Actions
    addAgentMessage: (message: AgentMessage) => void;
    sendAgentMessage: (content: string, mentions?: string[]) => Promise<void>;
    clearAgentMessages: () => void;
    addPendingDiff: (diff: DocumentDiff) => void;
    getMergedPendingDiffs: () => Record<string, DocumentDiff>;
    acceptAllPending: () => Promise<void>;
    rejectAllPending: () => void;
    approveDiff: (diffId: string) => Promise<void>;
    rejectDiff: (diffId: string) => void;
    setAgentMentionedFiles: (files: string[]) => void;
    setAgentLoading: (loading: boolean) => void;
    setAgentError: (error: string | null) => void;
    setAgentProvider: (provider: LLMProvider) => void;
    setAgentModel: (model: string) => void;
    setAgentReadOnly: (readOnly: boolean) => void;
    setAgentApiKey: (provider: LLMProvider, key: string) => void;
    setAgentProviderKeyValid: (provider: LLMProvider, valid: boolean) => void;
    setAgentTemperature: (temperature: number) => void;
    setAgentMaxTokens: (maxTokens: number) => void;
    setAgentUseOrchestration: (useOrchestration: boolean) => void;
    // Chat history (chats are linked to the active document when created)
    createNewChat: () => string;
    switchChat: (chatId: string) => void;
    clearAllChats: () => void;
    getChatsList: () => AgentChat[];
    /** Sync active chat to the current document (latest chat for this document, or new chat) */
    ensureActiveChatForDocument: () => void;

    // RAG Actions
    fetchRagDocuments: () => Promise<void>;
    addRagDocument: (doc: RagDocument) => Promise<void>;
    removeRagDocument: (id: string) => Promise<void>;

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
        pageSize: { preset: 'a4' },
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
        tables: { preventPageBreak: false, equalWidthColumns: false, alignment: 'center', maxWidth: 100, headerStyle: { bold: true, backgroundColor: '' } },
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
        figures: {
            captionEnabled: true,
            captionFormat: 'Figure #: {Caption}',
            defaultWidth: '',
            defaultHeight: '',
            margins: {
                top: '0mm',
                bottom: '5mm',
                left: '0mm',
                right: '0mm',
            },
            alignment: 'center',
        },
        alerts: {
            showHeader: true,
        },
    }
};

export const useStore = create<AppState>()(
    persist(
        (set, get) => {
            // Set up cross-window synchronization
            if (typeof window !== 'undefined') {
                // Listen for storage events (localStorage changes from other windows)
                const handleStorageChange = async (e: StorageEvent) => {
                    if (e.key === 'markdown-editor-storage' && e.newValue) {
                        try {
                            const newState = JSON.parse(e.newValue);
                            const currentState = get();

                            // Update persisted state fields
                            const updates: Partial<AppState> = {};

                            if (newState.state.activeFileId !== currentState.activeFileId) {
                                updates.activeFileId = newState.state.activeFileId;
                                // If file changed and we don't have it loaded, load it
                                if (newState.state.activeFileId && !currentState.files.find(f => f.id === newState.state.activeFileId)) {
                                    try {
                                        // First check if there's a synced version in localStorage
                                        let content: string;
                                        const fileSyncKey = localStorage.getItem('markdown-editor-file-sync');
                                        if (fileSyncKey) {
                                            const syncData = JSON.parse(fileSyncKey);
                                            if (syncData.fileId === newState.state.activeFileId && syncData.content) {
                                                content = syncData.content;
                                            } else {
                                                content = await browserStorage.readFile(newState.state.activeFileId);
                                            }
                                        } else {
                                            content = await browserStorage.readFile(newState.state.activeFileId);
                                        }

                                        const newFile: AppStateFile = {
                                            id: newState.state.activeFileId,
                                            name: newState.state.activeFileId.split('/').pop() || newState.state.activeFileId,
                                            content,
                                            language: 'markdown'
                                        };
                                        const currentFiles = Array.isArray(currentState.files) ? currentState.files : [];
                                        updates.files = [...currentFiles, newFile];
                                    } catch (error) {
                                        console.error('Failed to load file on sync:', error);
                                    }
                                }
                            }

                            if (newState.state.activeTemplateId !== currentState.activeTemplateId) {
                                updates.activeTemplateId = newState.state.activeTemplateId;
                                // Update activeTemplateCss if template changed
                                if (newState.state.activeTemplateId) {
                                    const currentTemplates = Array.isArray(currentState.templates) ? currentState.templates : [];
                                    const template = currentTemplates.find(t => t.id === newState.state.activeTemplateId);
                                    if (template) {
                                        updates.activeTemplateCss = template.css;
                                    }
                                }
                            }

                            // Sync other persisted fields - only if actually different
                            if (newState.state.openTabs !== undefined) {
                                if (!Array.isArray(newState.state.openTabs)) {
                                    console.error('[Store] openTabs from storage is not array', newState.state.openTabs);
                                }
                                const nextOpenTabs = Array.isArray(newState.state.openTabs)
                                    ? newState.state.openTabs
                                    : [];
                                // Deep compare openTabs to avoid unnecessary updates that could cause loops
                                const currentTabs = JSON.stringify(currentState.openTabs);
                                const newTabs = JSON.stringify(nextOpenTabs);
                                if (currentTabs !== newTabs) {
                                    updates.openTabs = nextOpenTabs;
                                }
                            }
                            if (newState.state.currentView !== undefined && newState.state.currentView !== currentState.currentView) {
                                updates.currentView = newState.state.currentView;
                            }

                            // Apply updates if any
                            if (Object.keys(updates).length > 0) {
                                set(updates);
                            }
                        } catch (error) {
                            console.error('Failed to sync state from storage event:', error);
                        }
                    } else if (e.key === 'markdown-editor-file-sync' && e.newValue) {
                        // Handle file content sync
                        try {
                            const syncData = JSON.parse(e.newValue);
                            const currentState = get();

                            if (syncData.fileId && syncData.content !== undefined) {
                                const currentFiles = Array.isArray(currentState.files) ? currentState.files : [];
                                const existingFile = currentFiles.find(f => f.id === syncData.fileId);
                                if (existingFile && existingFile.content !== syncData.content) {
                                    set((state) => {
                                        const files = Array.isArray(state.files) ? state.files : [];
                                        return {
                                            files: files.map((f) =>
                                                f.id === syncData.fileId ? { ...f, content: syncData.content } : f
                                            )
                                        };
                                    });
                                } else if (!existingFile) {
                                    // File not loaded, add it if it's the active file or if we should load it
                                    const shouldLoad = syncData.fileId === currentState.activeFileId;
                                    if (shouldLoad) {
                                        const newFile: AppStateFile = {
                                            id: syncData.fileId,
                                            name: syncData.fileId.split('/').pop() || syncData.fileId,
                                            content: syncData.content,
                                            language: 'markdown'
                                        };
                                        set((state) => ({ files: [...(Array.isArray(state.files) ? state.files : []), newFile] }));
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Failed to sync file content:', error);
                        }
                    }
                };

                window.addEventListener('storage', handleStorageChange);

                // Also check for file content updates periodically as a fallback
                // (in case storage events don't fire in some scenarios)
                let lastFileSyncTimestamp = 0;
                const handleFileContentSync = async () => {
                    try {
                        const fileContentSyncKey = localStorage.getItem('markdown-editor-file-sync');
                        if (!fileContentSyncKey) return;

                        const syncData = JSON.parse(fileContentSyncKey);
                        // Only process if timestamp is newer than last processed
                        if (syncData.timestamp && syncData.timestamp <= lastFileSyncTimestamp) return;
                        lastFileSyncTimestamp = syncData.timestamp || Date.now();

                        const currentState = get();

                        // Check if we need to update file content
                        if (syncData.fileId && syncData.content !== undefined) {
                            const currentFiles = Array.isArray(currentState.files) ? currentState.files : [];
                            const existingFile = currentFiles.find(f => f.id === syncData.fileId);
                            if (existingFile && existingFile.content !== syncData.content) {
                                set((state) => {
                                    const files = Array.isArray(state.files) ? state.files : [];
                                    return {
                                        files: files.map((f) =>
                                            f.id === syncData.fileId ? { ...f, content: syncData.content } : f
                                        )
                                    };
                                });
                            } else if (!existingFile && syncData.fileId === currentState.activeFileId) {
                                // File not loaded but is active, load it
                                const newFile: AppStateFile = {
                                    id: syncData.fileId,
                                    name: syncData.fileId.split('/').pop() || syncData.fileId,
                                    content: syncData.content,
                                    language: 'markdown'
                                };
                                set((state) => ({ files: [...(Array.isArray(state.files) ? state.files : []), newFile] }));
                            }
                        }
                    } catch (error) {
                        console.error('Failed to sync file content:', error);
                    }
                };

                // Check for file content updates periodically (fallback mechanism)
                const fileContentSyncInterval = setInterval(handleFileContentSync, 1000);

                // Cleanup on window unload
                window.addEventListener('beforeunload', () => {
                    window.removeEventListener('storage', handleStorageChange);
                    clearInterval(fileContentSyncInterval);
                });
            }

            return {
                // Initial State
                fileTree: [],
                isLoadingFileTree: false,
                files: [],
                activeFileId: null,
                openTabs: [],
                leftSidebarExpanded: true,
                rightSidebarExpanded: true,
                exportWindowOpen: false,
                sidebarView: 'explorer',
                templates: [],
                activeTemplateId: null,
                activeTemplateCss: '',
                customFonts: [],
                fontsLoaded: false, // Set to true after fetchFonts() completes
                editorViewMode: 'editing',
                currentView: 'file',
                isSettingsOpen: false,
                previewQuality: 'medium',
                uiIconSize: 'normal',
                uiFontSize: 'normal',
                showOutline: true,
                activeHeadingId: null,
                sourceEditorFontFamily: 'monospace',
                sourceEditorFontSize: 14,

                // Agent Initial State (multiple chats)
                chats: {},
                activeChatId: null,
                agentMessages: [],
                pendingDiffs: {},
                agentMentionedFiles: [],
                agentLoading: false,
                agentCurrentStep: null,
                agentError: null,
                agentProvider: 'openai',
                agentModel: 'gpt-4o',
                agentReadOnly: false,
                agentApiKeys: { openai: '', anthropic: '', google: '' },
                agentProviderKeysValid: { openai: false, anthropic: false, google: false },
                agentTemperature: 0.7,
                agentMaxTokens: 4096,
                agentUseOrchestration: true,
                ragDocuments: [],

                // Actions implementation
                fetchFileTree: async () => {
                    console.log('[Store] fetchFileTree called');
                    set({ isLoadingFileTree: true });
                    try {
                        let { tree } = await browserStorage.list();
                        console.log('[Store] fetchFileTree got tree:', tree.length, 'root items');

                        // Check if Files folder has any files
                        const filesRoot = tree.find(n => n.name === 'Files');
                        const hasFiles = filesRoot?.children && filesRoot.children.length > 0;

                        // If no files exist, load all preloaded files from manifest
                        if (!hasFiles) {
                            try {
                                // Fetch the manifest to get list of preloaded files
                                const manifestResponse = await fetch('/preloaded/manifest.json');
                                if (manifestResponse.ok) {
                                    const manifest = await manifestResponse.json();
                                    const preloadedFiles: string[] = manifest.files || [];

                                    let firstFilePath: string | null = null;

                                    // Load all preloaded files
                                    for (const fileName of preloadedFiles) {
                                        try {
                                            const response = await fetch(`/preloaded/${encodeURIComponent(fileName)}`);
                                            if (response.ok) {
                                                const content = await response.text();
                                                const path = `Files/${fileName}`;
                                                // Overwrite true to prevent errors if file exists but wasn't in tree for some reason
                                                await browserStorage.createFile(path, content, true);

                                                // Track the first file to open it later
                                                if (!firstFilePath) {
                                                    firstFilePath = path;
                                                }
                                            }
                                        } catch (err) {
                                            console.error(`Failed to load preloaded file ${fileName}:`, err);
                                        }
                                    }

                                    // Re-fetch tree after creating preloaded files
                                    const result = await browserStorage.list();
                                    tree = result.tree;

                                    // Open the first file
                                    if (firstFilePath) {
                                        setTimeout(() => get().openFile(firstFilePath!), 100);
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to load preloaded files:', err);
                            }
                        }

                        console.log('[Store] Setting fileTree with', tree.length, 'root items');
                        set({ fileTree: tree });
                    } catch (error) {
                        console.error('[Store] Failed to fetch file tree:', error);
                    } finally {
                        set({ isLoadingFileTree: false });
                    }
                },

                fetchTemplates: async () => {
                    console.log('[Store] fetchTemplates called');
                    try {
                        let templates = await browserStorage.listTemplates();
                        console.log('[Store] fetchTemplates got', templates.length, 'templates');

                        // Check if "Default Templates" folder exists by checking if any template is in that folder
                        const defaultTemplatesFolder = 'Templates/Default Templates';
                        const hasDefaultTemplates = templates.some(t => t.id.startsWith(defaultTemplatesFolder + '/'));

                        if (!hasDefaultTemplates) {
                            // Load all templates from /preloaded/Default Templates/ folder
                            const templateFiles = ['Academic.mdt', 'Basic.mdt', 'Dark.mdt', 'Modern.mdt'];

                            for (const templateFile of templateFiles) {
                                try {
                                    const response = await fetch(`/preloaded/Default Templates/${templateFile}`);
                                    if (response.ok) {
                                        const templateData = await response.json();
                                        // Update the id to match the storage path with folder structure
                                        const path = `${defaultTemplatesFolder}/${templateFile}`;
                                        templateData.id = path;
                                        await browserStorage.createTemplate(path, templateData, true);
                                    }
                                } catch (err) {
                                    console.error(`Failed to load template ${templateFile}:`, err);
                                }
                            }

                            // Re-fetch to get the files with correct metadata
                            templates = await browserStorage.listTemplates();

                            // Trigger file tree refresh so it shows in sidebar
                            get().fetchFileTree();
                        }

                        set({ templates });

                        // Set active template if needed - prioritize "Basic" template on first load
                        const state = get();
                        const hasValidActiveTemplate = state.activeTemplateId &&
                            templates.some(t => t.id === state.activeTemplateId);

                        if (!hasValidActiveTemplate && templates.length > 0) {
                            // First try to find "Basic" template by filename (since Basic.mdt has name "Default")
                            const basicTemplate = templates.find(t => t.id.includes('Basic.mdt'));

                            const selectedTemplate = basicTemplate || templates[0];
                            set({
                                activeTemplateId: selectedTemplate.id,
                                activeTemplateCss: selectedTemplate.css
                            });
                        } else if (hasValidActiveTemplate) {
                            // Ensure activeTemplateCss is set when restoring a valid activeTemplateId
                            const activeTemplate = templates.find(t => t.id === state.activeTemplateId);
                            if (activeTemplate && state.activeTemplateCss !== activeTemplate.css) {
                                set({
                                    activeTemplateCss: activeTemplate.css
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Failed to fetch templates:', error);
                    }
                },

                fetchFonts: async () => {
                    try {
                        const storedFonts = await browserStorage.listFonts();

                        // Check for missing preloaded fonts
                        const missingPreloaded = PRELOADED_FONTS.filter(pf =>
                            !storedFonts.some(f => f.family === pf.family)
                        );

                        if (missingPreloaded.length > 0) {
                            console.log(`[Store] Found ${missingPreloaded.length} missing preloaded fonts, loading...`);

                            const loadedPreloaded = await Promise.all(
                                missingPreloaded.map(async (pf) => {
                                    try {
                                        const response = await fetch(`/fonts/preloaded/${pf.fileName}`);
                                        if (!response.ok) throw new Error(`Failed to fetch ${pf.family}`);
                                        const blob = await response.blob();

                                        const fontEntry: FontEntry = {
                                            id: pf.family,
                                            family: pf.family,
                                            blob,
                                            fileName: pf.fileName,
                                            format: pf.format,
                                            createdAt: Date.now(),
                                            syncId: generateSyncId(),
                                            updatedAt: Date.now(),
                                            isDeleted: false,
                                            userId: null
                                        };

                                        await browserStorage.saveFont(fontEntry);
                                        return fontEntry;
                                    } catch (e) {
                                        console.error(`[Store] Failed to load preloaded font ${pf.family}:`, e);
                                        return null;
                                    }
                                })
                            );

                            const validPreloaded = loadedPreloaded.filter((f): f is FontEntry => f !== null);
                            storedFonts.push(...validPreloaded);
                        }

                        // Set both customFonts and fontsLoaded atomically
                        set({ customFonts: storedFonts, fontsLoaded: true });
                        console.log(`[Store] fetchFonts completed: ${storedFonts.length} fonts loaded, fontsLoaded=true`);
                    } catch (error) {
                        console.error('Failed to fetch fonts:', error);
                        set({ fontsLoaded: true });
                    }
                },

                restoreSession: async () => {
                    const { openTabs, files } = get();
                    const safeOpenTabs = Array.isArray(openTabs) ? openTabs : [];
                    const safeFiles = Array.isArray(files) ? files : [];
                    if (!Array.isArray(openTabs)) {
                        console.error('[Store] restoreSession openTabs not array', openTabs);
                    }
                    if (!Array.isArray(files)) {
                        console.error('[Store] restoreSession files not array', files);
                    }
                    const newFiles = [...safeFiles];
                    let hasUpdates = false;

                    for (const tab of safeOpenTabs) {
                        if (tab.type === 'file') {
                            const isLoaded = newFiles.some(f => f.id === tab.id);
                            // Optimization: Only load content for the active file immediately
                            // Other files will be loaded on demand when switching tabs
                            const isActive = get().activeFileId === tab.id;

                            if (!isLoaded && isActive) {
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
                        const fileEntry = await browserStorage.createFile(path, content);
                        await get().fetchFileTree();
                        await get().openFile(path);

                        // Trigger cloud sync (push + pull)
                        if (syncService.isActive) {
                            syncQueue.enqueueFile(fileEntry);
                            syncService.pullDelta().catch(console.error);
                        }
                    } catch (error) {
                        console.error('Failed to create file:', error);
                    }
                },

                createFolder: async (path: string) => {
                    try {
                        const folderEntry = await browserStorage.createFolder(path);
                        await get().fetchFileTree();

                        // Trigger cloud sync (push + pull)
                        if (syncService.isActive) {
                            syncQueue.enqueueFile(folderEntry);
                            syncService.pullDelta().catch(console.error);
                        }
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

                        // Trigger cloud sync (push + pull) - templates are stored as files
                        if (syncService.isActive) {
                            const fileEntry = await browserStorage.getFileEntry(path);
                            if (fileEntry) {
                                syncQueue.enqueueFile(fileEntry);
                            }
                            syncService.pullDelta().catch(console.error);
                        }
                    } catch (error) {
                        console.error('Failed to create template:', error);
                    }
                },

                saveTemplate: async (path: string, template: Template) => {
                    try {
                        await browserStorage.saveTemplate(path, template);
                        set((state) => {
                            const templates = Array.isArray(state.templates) ? state.templates : [];
                            return { templates: templates.map((t) => (t.id === path ? template : t)) };
                        });

                        // Trigger cloud sync (templates are stored as files)
                        if (syncService.isActive) {
                            const fileEntry = await browserStorage.getFileEntry(path);
                            if (fileEntry) {
                                syncQueue.enqueueFile(fileEntry);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to save template:', error);
                    }
                },

                deleteItem: async (path: string, type: 'file' | 'folder') => {
                    try {
                        // For cloud sync: soft-delete, push immediately (before hard-delete), then pull
                        if (syncService.isActive) {
                            const deletedEntry = await browserStorage.softDeleteFile(path);
                            if (deletedEntry) {
                                await syncService.pushFile(deletedEntry);
                            }
                            syncService.pullDelta().catch(console.error);
                        }

                        // Hard delete locally
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
                        // If renaming a template file, update the template JSON's name and id
                        if (oldPath.startsWith('Templates/') && (oldPath.endsWith('.mdt') || oldPath.endsWith('.json'))) {
                            try {
                                const content = await browserStorage.readFile(oldPath);
                                const template = JSON.parse(content);

                                // Extract filename without extension for the name
                                const newFileName = newPath.split('/').pop() || newPath;
                                const nameWithoutExt = newFileName.replace(/\.(mdt|json)$/, '');

                                // Update template name and id
                                template.name = nameWithoutExt;
                                template.id = newPath;

                                // Write updated template content before renaming
                                await browserStorage.writeFile(oldPath, JSON.stringify(template, null, 2));
                            } catch (err) {
                                console.error('Failed to update template JSON during rename:', err);
                            }
                        }

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
                        // Note: Fonts are NOT synced to cloud (local-only)
                    } catch (error) {
                        console.error('Failed to add font:', error);
                    }
                },

                deleteFont: async (id) => {
                    try {
                        await browserStorage.deleteFont(id);
                        await get().fetchFonts();
                        // Note: Fonts are NOT synced to cloud (local-only)
                    } catch (error) {
                        console.error('Failed to delete font:', error);
                    }
                },

                openFile: async (path: string) => {
                    const state = get();
                    const files = Array.isArray(state.files) ? state.files : [];
                    const openTabs = Array.isArray(state.openTabs) ? state.openTabs : [];
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
                            set(state => ({ files: [...(Array.isArray(state.files) ? state.files : []), newFile] }));
                            // Sync file content to other windows
                            if (typeof window !== 'undefined') {
                                try {
                                    localStorage.setItem('markdown-editor-file-sync', JSON.stringify({
                                        fileId: path,
                                        content: content,
                                        timestamp: Date.now()
                                    }));
                                } catch (error) {
                                    console.error('Failed to sync file content:', error);
                                }
                            }
                        } catch (error) {
                            console.error('Failed to fetch file content:', error);
                            return;
                        }
                    } else {
                        // Even if file exists, sync current content to other windows
                        if (typeof window !== 'undefined') {
                            try {
                                localStorage.setItem('markdown-editor-file-sync', JSON.stringify({
                                    fileId: path,
                                    content: existingFile.content,
                                    timestamp: Date.now()
                                }));
                            } catch (error) {
                                console.error('Failed to sync file content:', error);
                            }
                        }
                    }

                    const currentState = get();
                    const isAlreadyActive = currentState.activeFileId === path && currentState.currentView === 'file';
                    const currentOpenTabs = Array.isArray(currentState.openTabs) ? currentState.openTabs : [];
                    const isInTabs = currentOpenTabs.some(tab => tab.id === path && tab.type === 'file');

                    // Skip state update if already active and in tabs - prevents unnecessary updates that could cause loops
                    if (isAlreadyActive && isInTabs) {
                        return;
                    }

                    if (!isInTabs) {
                        set(state => ({
                            activeFileId: path,
                            currentView: 'file',
                            openTabs: [...(Array.isArray(state.openTabs) ? state.openTabs : []), { id: path, type: 'file' }]
                        }));
                    } else {
                        set({ activeFileId: path, currentView: 'file' });
                    }
                    get().ensureActiveChatForDocument();
                },

                saveFile: async (path: string, content: string) => {
                    try {
                        const fileEntry = await browserStorage.writeFile(path, content);
                        // Update local file content and sync to other windows
                        set((state) => {
                            const files = Array.isArray(state.files) ? state.files : [];
                            return { files: files.map((f) => (f.id === path ? { ...f, content } : f)) };
                        });
                        // Sync file content to other windows
                        if (typeof window !== 'undefined') {
                            try {
                                localStorage.setItem('markdown-editor-file-sync', JSON.stringify({
                                    fileId: path,
                                    content: content,
                                    timestamp: Date.now()
                                }));
                            } catch (error) {
                                console.error('Failed to sync file content:', error);
                            }
                        }

                        // Trigger cloud sync
                        if (syncService.isActive) {
                            syncQueue.enqueueFile(fileEntry);
                        }
                    } catch (error) {
                        console.error('Failed to save file:', error);
                    }
                },

                updateFileContent: (id, content) => {
                    set((state) => {
                        const files = Array.isArray(state.files) ? state.files : [];
                        return { files: files.map((f) => (f.id === id ? { ...f, content } : f)) };
                    });
                    // Sync file content to other windows
                    if (typeof window !== 'undefined') {
                        try {
                            localStorage.setItem('markdown-editor-file-sync', JSON.stringify({
                                fileId: id,
                                content: content,
                                timestamp: Date.now()
                            }));
                        } catch (error) {
                            console.error('Failed to sync file content:', error);
                        }
                    }
                },

                closeTab: (id) => set((state) => {
                    const openTabs = Array.isArray(state.openTabs) ? state.openTabs : [];
                    const tabIndex = openTabs.findIndex(t => t.id === id);
                    if (tabIndex === -1) return {};

                    const tabToRemove = openTabs[tabIndex];
                    const newTabs = openTabs.filter(t => t.id !== id);

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
                            const templates = Array.isArray(state.templates) ? state.templates : [];
                            return {
                                openTabs: newTabs,
                                activeTemplateId: nextTab.id,
                                currentView: 'template',
                                activeTemplateCss: templates.find(t => t.id === nextTab.id)?.css || state.activeTemplateCss
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
                setExportWindowOpen: (isOpen) => set({ exportWindowOpen: isOpen }),
                setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
                setPreviewQuality: (quality) => set({ previewQuality: quality }),
                setUiIconSize: (size) => set({ uiIconSize: size }),
                setUiFontSize: (size) => set({ uiFontSize: size }),
                setShowOutline: (show) => set({ showOutline: show }),
                setActiveHeadingId: (headingId) => set({ activeHeadingId: headingId }),
                setSourceEditorFontFamily: (fontFamily) => set({ sourceEditorFontFamily: fontFamily }),
                setSourceEditorFontSize: (fontSize) => set({ sourceEditorFontSize: fontSize }),
                addTemplate: (template) => set((state) => ({ templates: [...(Array.isArray(state.templates) ? state.templates : []), template] })),
                updateTemplate: (id, updates) => set((state) => {
                    const templates = Array.isArray(state.templates) ? state.templates : [];
                    return { templates: templates.map((t) => (t.id === id ? { ...t, ...updates } : t)) };
                }),
                updateTemplateCss: (id, css) => set((state) => {
                    const templates = Array.isArray(state.templates) ? state.templates : [];
                    return {
                        templates: templates.map((t) => (t.id === id ? { ...t, css } : t)),
                        activeTemplateCss: state.activeTemplateId === id ? css : state.activeTemplateCss
                    };
                }),
                setActiveTemplate: (id) => set((state) => {
                    const templates = Array.isArray(state.templates) ? state.templates : [];
                    const template = templates.find(t => t.id === id);
                    return {
                        activeTemplateId: id,
                        activeTemplateCss: template ? template.css : state.activeTemplateCss
                    };
                }),
                setActiveTemplateCss: (css: string) => set({ activeTemplateCss: css }),
                setEditorViewMode: (editorViewMode) => set({ editorViewMode }),
                openTemplate: (id) => {
                    const state = get();
                    const templates = Array.isArray(state.templates) ? state.templates : [];
                    const openTabs = Array.isArray(state.openTabs) ? state.openTabs : [];
                    const template = templates.find(t => t.id === id);
                    const isAlreadyActive = state.activeTemplateId === id && state.currentView === 'template';
                    const isInTabs = openTabs.some(tab => tab.id === id && tab.type === 'template');

                    // Skip state update if already active and in tabs - prevents unnecessary updates that could cause loops
                    if (isAlreadyActive && isInTabs) {
                        return;
                    }

                    if (!isInTabs) {
                        set({
                            activeTemplateId: id,
                            activeTemplateCss: template ? template.css : state.activeTemplateCss,
                            currentView: 'template',
                            openTabs: [...openTabs, { id, type: 'template' }],
                        });
                    } else {
                        set({
                            activeTemplateId: id,
                            activeTemplateCss: template ? template.css : state.activeTemplateCss,
                            currentView: 'template'
                        });
                    }
                },

                // Agent Actions (sync to active chat in chats)
                addAgentMessage: (message) => set((state) => {
                    const agentMessages = Array.isArray(state.agentMessages) ? state.agentMessages : [];
                    const nextMessages = [...agentMessages, message];
                    const updates: Partial<AppState> = { agentMessages: nextMessages };
                    if (state.activeChatId && state.chats[state.activeChatId]) {
                        const chat = state.chats[state.activeChatId];
                        const title = chat.messages.length === 0 && message.role === 'user'
                            ? (message.content.slice(0, 50).trim() || 'New chat') + (message.content.length > 50 ? '…' : '')
                            : chat.title;
                        updates.chats = {
                            ...state.chats,
                            [state.activeChatId]: {
                                ...chat,
                                title,
                                messages: nextMessages,
                                updatedAt: Date.now(),
                            },
                        };
                    }
                    return updates;
                }),

                sendAgentMessage: async (content, _mentions = []) => {
                    if (!get().activeChatId) {
                        get().createNewChat();
                    }
                    // Use currently open/focused file for context (mentions UI is hidden for now)
                    const state = get();
                    const filesForContext =
                        state.currentView === 'file' && state.activeFileId
                            ? [state.activeFileId]
                            : [];

                    // Build RAG context from attached documents (text/url only; images go as vision parts)
                    let ragContext = '';
                    if (state.ragDocuments.length > 0) {
                        const ragParts: string[] = [];
                        for (const doc of state.ragDocuments) {
                            if (doc.type === 'text' && doc.content) {
                                ragParts.push(`--- Attached Document: ${doc.name} ---\n${doc.content}\n--- End of ${doc.name} ---`);
                            } else if (doc.type === 'url' && doc.url) {
                                if (doc.content) {
                                    ragParts.push(`--- Attached Link: ${doc.name} ---\nURL: ${doc.url}\nContent:\n${doc.content}\n--- End of ${doc.name} ---`);
                                } else {
                                    ragParts.push(`--- Attached Link: ${doc.name} ---\nURL: ${doc.url}\n(Content not fetched)\n--- End of ${doc.name} ---`);
                                }
                            }
                            // type === 'image' is sent as vision attachment, not in ragContext
                        }
                        if (ragParts.length > 0) {
                            ragContext = '\n\n[Attached Documents/Links for Context]:\n' + ragParts.join('\n\n');
                        }
                    }

                    // Combine user content with RAG context
                    const fullContent = ragContext
                        ? `${content}${ragContext}`
                        : content;

                    // Create concise tags for visible display
                    let displayTags = '';
                    const ragDocuments = Array.isArray(state.ragDocuments) ? state.ragDocuments : [];
                    if (ragDocuments.length > 0) {
                        const tags = ragDocuments.map(doc => {
                            if (doc.type === 'text') return `[📄 ${doc.name}]`;
                            if (doc.type === 'image') return `[🖼 ${doc.name}]`;
                            const shortName = doc.name.length > 30 ? doc.name.substring(0, 27) + '...' : doc.name;
                            return `[🔗 ${shortName}]`;
                        });
                        displayTags = '\n\n' + tags.join(' ');
                    }
                    const visibleContent = content + displayTags;

                    // Build image attachments for vision (data URL -> base64 + mimeType)
                    const imageAttachments = ragDocuments
                        .filter((d): d is typeof d & { type: 'image'; content: string } => d.type === 'image' && !!d.content)
                        .map(doc => {
                            const dataUrl = doc.content!;
                            const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
                            const base64 = match ? match[2] : dataUrl;
                            const mimeType = match ? match[1] : 'image/png';
                            return { base64, mimeType, name: doc.name };
                        });

                    agentLog.info('sendAgentMessage', {
                        mode: state.agentUseOrchestration ? 'orchestration' : 'single-agent',
                        readOnly: state.agentReadOnly,
                        fileContext: filesForContext,
                        contentLength: content.length,
                        ragDocuments: ragDocuments.length,
                        ragContextLength: ragContext.length,
                        imageAttachments: imageAttachments.length,
                    });
                    const userMessage = createMessage('user', visibleContent, [], undefined, fullContent, imageAttachments.length > 0 ? imageAttachments : undefined);
                    const currentChatId = get().activeChatId;
                    const ragDocsToClear = ragDocuments;
                    set((s) => {
                        const agentMessages = Array.isArray(s.agentMessages) ? s.agentMessages : [];
                        const nextMessages = [...agentMessages, userMessage];
                        const updates: Partial<AppState> = {
                            agentMessages: nextMessages,
                            agentMentionedFiles: filesForContext,
                            agentLoading: true,
                            agentCurrentStep: null,
                            agentError: null,
                            ragDocuments: [],
                        };
                        if (currentChatId && s.chats[currentChatId]) {
                            const chat = s.chats[currentChatId];
                            const title = chat.messages.length === 0
                                ? (content.slice(0, 50).trim() || 'New chat') + (content.length > 50 ? '…' : '')
                                : chat.title;
                            updates.chats = {
                                ...s.chats,
                                [currentChatId]: {
                                    ...chat,
                                    title,
                                    messages: nextMessages,
                                    updatedAt: Date.now(),
                                },
                            };
                        }
                        return updates;
                    });
                    if (ragDocsToClear.length > 0) {
                        await Promise.all(ragDocsToClear.map((d) => browserStorage.deleteRagDocument(d.id)));
                    }

                    try {
                        const state = get();
                        const agentMessages = Array.isArray(state.agentMessages) ? state.agentMessages : [];
                        const allMessages = [...agentMessages];

                        // Callback for handling diff creation
                        const onDiffCreated = (diff: DocumentDiff) => {
                            set((s) => {
                                const nextDiffs = { ...s.pendingDiffs, [diff.id]: diff };
                                const updates: Partial<AppState> = { pendingDiffs: nextDiffs };
                                if (s.activeChatId && s.chats[s.activeChatId]) {
                                    updates.chats = {
                                        ...s.chats,
                                        [s.activeChatId]: {
                                            ...s.chats[s.activeChatId],
                                            pendingDiffs: nextDiffs,
                                            updatedAt: Date.now(),
                                        },
                                    };
                                }
                                return updates;
                            });
                        };

                        let response: { content: string; diffs?: DocumentDiff[] };

                        if (state.agentUseOrchestration) {
                            // Use multi-agent orchestration system (any provider)
                            const provider = modelToProvider(state.agentModel);
                            const apiKey = state.agentApiKeys[provider]?.trim() || undefined;
                            const stepLabels: Record<string, string> = {
                                researcher: '🔍 Researching',
                                planner: '📋 Planning',
                                writer: '✍️ Writing',
                                structure_review: '📐 Reviewing structure',
                                linter: '✨ Linting',
                                summarizer: '💬 Summarizing',
                            };
                            const initialContentOverrides =
                                state.currentView === 'file' && state.activeFileId
                                    ? { [state.activeFileId]: state.files.find((f) => f.id === state.activeFileId)?.content ?? '' }
                                    : undefined;

                            const orchestrationResult = await runOrchestration(
                                allMessages,
                                filesForContext,
                                {
                                    provider,
                                    model: state.agentModel,
                                    readOnly: state.agentReadOnly,
                                    apiKey,
                                    temperature: state.agentTemperature,
                                    maxTokens: state.agentMaxTokens,
                                    onDiffCreated,
                                    initialContentOverrides,
                                    onEvent: (event) => {
                                        if (event.type === 'step_started') {
                                            set({ agentCurrentStep: stepLabels[event.step.agentType] ?? event.step.agentType });
                                        } else if (event.type === 'workflow_completed' || event.type === 'workflow_failed') {
                                            set({ agentCurrentStep: null });
                                        }
                                    },
                                }
                            );
                            response = {
                                content: orchestrationResult.content,
                                diffs: orchestrationResult.diffs,
                            };
                        } else {
                            const provider = modelToProvider(state.agentModel);
                            const apiKeyOverride = state.agentApiKeys[provider]?.trim() || undefined;
                            const initialContentOverrides =
                                state.currentView === 'file' && state.activeFileId
                                    ? { [state.activeFileId]: state.files.find((f) => f.id === state.activeFileId)?.content ?? '' }
                                    : undefined;

                            response = await sendMessageToAI(
                                allMessages,
                                filesForContext,
                                undefined,
                                {
                                    provider,
                                    model: state.agentModel,
                                    readOnly: state.agentReadOnly,
                                    apiKeyOverride,
                                    temperature: state.agentTemperature,
                                    maxTokens: state.agentMaxTokens,
                                    onDiffCreated,
                                    initialContentOverrides,
                                }
                            );
                        }

                        agentLog.info('response received', { contentLength: response.content?.length ?? 0, diffs: response.diffs?.length ?? 0 });
                        // Ensure all returned diffs are in pendingDiffs (fallback if onDiffCreated missed any)
                        for (const diff of response.diffs ?? []) {
                            get().addPendingDiff(diff);
                        }
                        const assistantMessage = createMessage(
                            'assistant',
                            response.content,
                            undefined,
                            response.diffs?.map(d => d.id)
                        );
                        set((s) => {
                            const agentMessages = Array.isArray(s.agentMessages) ? s.agentMessages : [];
                            const nextMessages = [...agentMessages, assistantMessage];
                            const updates: Partial<AppState> = {
                                agentMessages: nextMessages,
                                agentLoading: false,
                            };
                            if (s.activeChatId && s.chats[s.activeChatId]) {
                                updates.chats = {
                                    ...s.chats,
                                    [s.activeChatId]: {
                                        ...s.chats[s.activeChatId],
                                        messages: nextMessages,
                                        updatedAt: Date.now(),
                                    },
                                };
                            }
                            return updates;
                        });
                    } catch (error) {
                        agentLog.error('AI service error', error);
                        set({
                            agentLoading: false,
                            agentCurrentStep: null,
                            agentError: error instanceof Error ? error.message : 'Failed to get AI response',
                        });
                    }
                },

                clearAgentMessages: () => set((state) => {
                    const updates: Partial<AppState> = {
                        agentMessages: [],
                        pendingDiffs: {},
                        agentMentionedFiles: [],
                        agentError: null,
                    };
                    if (state.activeChatId && state.chats[state.activeChatId]) {
                        updates.chats = {
                            ...state.chats,
                            [state.activeChatId]: {
                                ...state.chats[state.activeChatId],
                                messages: [],
                                pendingDiffs: {},
                                updatedAt: Date.now(),
                            },
                        };
                    }
                    return updates;
                }),

                addPendingDiff: (diff) => set((state) => {
                    const nextDiffs = { ...state.pendingDiffs, [diff.id]: diff };
                    const updates: Partial<AppState> = { pendingDiffs: nextDiffs };
                    if (state.activeChatId && state.chats[state.activeChatId]) {
                        updates.chats = {
                            ...state.chats,
                            [state.activeChatId]: {
                                ...state.chats[state.activeChatId],
                                pendingDiffs: nextDiffs,
                                updatedAt: Date.now(),
                            },
                        };
                    }
                    return updates;
                }),

                getMergedPendingDiffs: () => {
                    const state = get();
                    const pending = Object.values(state.pendingDiffs).filter((d) => d.status === 'pending');
                    const byFile: Record<string, DocumentDiff[]> = {};
                    for (const d of pending) {
                        if (!byFile[d.fileId]) byFile[d.fileId] = [];
                        byFile[d.fileId].push(d);
                    }
                    const merged: Record<string, DocumentDiff> = {};
                    for (const fileId of Object.keys(byFile)) {
                        const m = mergeDiffsForFile(byFile[fileId]);
                        if (m) merged[fileId] = m;
                    }
                    return merged;
                },

                acceptAllPending: async () => {
                    const merged = get().getMergedPendingDiffs();
                    const diffs = Object.values(merged);
                    if (diffs.length === 0) return;
                    try {
                        const state = get();
                        for (const diff of diffs) {
                            const currentFile = state.files.find((f) => f.id === diff.fileId);
                            const currentContent = currentFile?.content ?? '';
                            const norm = (s: string) => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                            if (norm(diff.originalContent) !== norm(currentContent)) {
                                console.warn(
                                    '[Store] Content drift when accepting diff: diff.originalContent differs from current file content. Backup saved. fileId=',
                                    diff.fileId
                                );
                            }
                            if (currentFile?.content !== undefined) {
                                saveBackupBeforeApply(diff.fileId, currentFile.content);
                            }
                        }
                        for (const diff of diffs) {
                            const newContent = applyDiffToContent(diff.originalContent, diff);
                            await get().saveFile(diff.fileId, newContent);
                        }
                        set((s) => {
                            const updates: Partial<AppState> = {
                                pendingDiffs: {},
                                files: s.files.map((f) => {
                                    const d = diffs.find((d) => d.fileId === f.id);
                                    if (!d) return f;
                                    return { ...f, content: applyDiffToContent(d.originalContent, d) };
                                }),
                            };
                            if (s.activeChatId && s.chats[s.activeChatId]) {
                                updates.chats = {
                                    ...s.chats,
                                    [s.activeChatId]: {
                                        ...s.chats[s.activeChatId],
                                        pendingDiffs: {},
                                        updatedAt: Date.now(),
                                    },
                                };
                            }
                            return updates;
                        });
                    } catch (error) {
                        console.error('Failed to apply changes:', error);
                        set({ agentError: 'Failed to apply changes' });
                    }
                },

                rejectAllPending: () =>
                    set((state) => {
                        const updates: Partial<AppState> = { pendingDiffs: {} };
                        if (state.activeChatId && state.chats[state.activeChatId]) {
                            updates.chats = {
                                ...state.chats,
                                [state.activeChatId]: {
                                    ...state.chats[state.activeChatId],
                                    pendingDiffs: {},
                                    updatedAt: Date.now(),
                                },
                            };
                        }
                        return updates;
                    }),

                approveDiff: async (diffId) => {
                    const state = get();
                    const diff = state.pendingDiffs[diffId];
                    if (!diff) {
                        console.error('Diff not found:', diffId);
                        return;
                    }
                    try {
                        const currentFile = state.files.find((f) => f.id === diff.fileId);
                        const currentContent = currentFile?.content ?? '';
                        const norm = (s: string) => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                        if (norm(diff.originalContent) !== norm(currentContent)) {
                            console.warn(
                                '[Store] Content drift when approving diff: diff.originalContent differs from current file content. Backup saved. fileId=',
                                diff.fileId
                            );
                        }
                        if (currentFile?.content !== undefined) {
                            saveBackupBeforeApply(diff.fileId, currentFile.content);
                        }
                        const newContent = applyDiffToContent(diff.originalContent, diff);
                        await get().saveFile(diff.fileId, newContent);
                        set((s) => {
                            const nextDiffs = {
                                ...s.pendingDiffs,
                                [diffId]: { ...diff, status: 'approved' as const },
                            };
                            const updates: Partial<AppState> = {
                                files: s.files.map((f) =>
                                    f.id === diff.fileId ? { ...f, content: newContent } : f
                                ),
                                pendingDiffs: nextDiffs,
                            };
                            if (s.activeChatId && s.chats[s.activeChatId]) {
                                updates.chats = {
                                    ...s.chats,
                                    [s.activeChatId]: {
                                        ...s.chats[s.activeChatId],
                                        pendingDiffs: nextDiffs,
                                        updatedAt: Date.now(),
                                    },
                                };
                            }
                            return updates;
                        });
                    } catch (error) {
                        console.error('Failed to apply diff:', error);
                        set({ agentError: 'Failed to apply changes' });
                    }
                },

                rejectDiff: (diffId) =>
                    set((state) => {
                        const nextDiffs = {
                            ...state.pendingDiffs,
                            [diffId]: { ...state.pendingDiffs[diffId], status: 'rejected' as const },
                        };
                        const updates: Partial<AppState> = { pendingDiffs: nextDiffs };
                        if (state.activeChatId && state.chats[state.activeChatId]) {
                            updates.chats = {
                                ...state.chats,
                                [state.activeChatId]: {
                                    ...state.chats[state.activeChatId],
                                    pendingDiffs: nextDiffs,
                                    updatedAt: Date.now(),
                                },
                            };
                        }
                        return updates;
                    }),

                setAgentMentionedFiles: (files) => set({ agentMentionedFiles: files }),
                setAgentLoading: (loading) => set({ agentLoading: loading }),
                setAgentError: (error) => set({ agentError: error }),
                setAgentProvider: (provider) => set({ agentProvider: provider }),
                setAgentModel: (model) => set({ agentModel: model }),
                setAgentReadOnly: (readOnly) => set({ agentReadOnly: readOnly }),
                setAgentApiKey: (provider, key) =>
                    set((s) => ({
                        agentApiKeys: { ...s.agentApiKeys, [provider]: key },
                        agentProviderKeysValid: { ...s.agentProviderKeysValid, [provider]: false },
                    })),
                setAgentProviderKeyValid: (provider, valid) =>
                    set((s) => ({ agentProviderKeysValid: { ...s.agentProviderKeysValid, [provider]: valid } })),
                setAgentTemperature: (temperature) => set({ agentTemperature: temperature }),
                setAgentMaxTokens: (maxTokens) => set({ agentMaxTokens: maxTokens }),
                setAgentUseOrchestration: (useOrchestration) => set({ agentUseOrchestration: useOrchestration }),

                createNewChat: () => {
                    const state = get();
                    const documentId =
                        state.currentView === 'file' && state.activeFileId
                            ? state.activeFileId
                            : null;
                    const id = generateId();
                    const now = Date.now();
                    const chat: AgentChat = {
                        id,
                        title: 'New chat',
                        documentId,
                        messages: [],
                        pendingDiffs: {},
                        createdAt: now,
                        updatedAt: now,
                    };
                    set((s) => ({
                        chats: { ...s.chats, [id]: chat },
                        activeChatId: id,
                        agentMessages: [],
                        pendingDiffs: {},
                        agentMentionedFiles: [],
                        agentError: null,
                        ragDocuments: [],
                    }));
                    return id;
                },

                switchChat: (chatId) => {
                    const state = get();
                    const chat = state.chats[chatId];
                    if (!chat) return;
                    set({
                        activeChatId: chatId,
                        agentMessages: chat.messages,
                        pendingDiffs: chat.pendingDiffs,
                        agentMentionedFiles: [],
                        agentError: null,
                    });
                    get().fetchRagDocuments();
                },

                clearAllChats: async () => {
                    const state = get();
                    const documentId =
                        state.currentView === 'file' && state.activeFileId
                            ? state.activeFileId
                            : null;
                    const chatIdsToRemove = Object.values(state.chats)
                        .filter((c) => (c.documentId ?? null) === documentId)
                        .map((c) => c.id);
                    await Promise.all(
                        chatIdsToRemove.map((chatId) =>
                            browserStorage.deleteRagDocumentsByChatId(chatId)
                        )
                    );
                    set((s) => {
                        const nextChats = { ...s.chats };
                        chatIdsToRemove.forEach((id) => delete nextChats[id]);
                        return {
                            chats: nextChats,
                            activeChatId: null,
                            agentMessages: [],
                            pendingDiffs: {},
                            agentMentionedFiles: [],
                            agentError: null,
                            ragDocuments: [],
                        };
                    });
                    get().ensureActiveChatForDocument();
                },

                getChatsList: () => {
                    const state = get();
                    const documentId =
                        state.currentView === 'file' && state.activeFileId
                            ? state.activeFileId
                            : null;
                    return Object.values(state.chats)
                        .filter((c) => (c.documentId ?? null) === documentId)
                        .sort((a, b) => b.updatedAt - a.updatedAt);
                },

                ensureActiveChatForDocument: () => {
                    const state = get();
                    const targetDocumentId =
                        state.currentView === 'file' && state.activeFileId
                            ? state.activeFileId
                            : null;
                    const currentChat = state.activeChatId
                        ? state.chats[state.activeChatId]
                        : null;
                    const currentChatDocumentId = currentChat?.documentId ?? null;
                    if (currentChatDocumentId === targetDocumentId) return;

                    const chatsForDoc = Object.values(state.chats)
                        .filter((c) => (c.documentId ?? null) === targetDocumentId)
                        .sort((a, b) => b.updatedAt - a.updatedAt);
                    if (chatsForDoc.length > 0) {
                        get().switchChat(chatsForDoc[0].id);
                    } else {
                        get().createNewChat();
                    }
                },

                fetchRagDocuments: async () => {
                    const { activeChatId } = get();
                    if (!activeChatId) {
                        set({ ragDocuments: [] });
                        return;
                    }
                    try {
                        const docs = await browserStorage.getRagDocumentsByChatId(activeChatId);
                        set({ ragDocuments: docs });
                    } catch (error) {
                        console.error('Failed to fetch RAG documents:', error);
                        set({ ragDocuments: [] });
                    }
                },

                addRagDocument: async (doc: RagDocument) => {
                    try {
                        await browserStorage.storeRagDocument(doc);
                        set(state => ({
                            ragDocuments: [...(Array.isArray(state.ragDocuments) ? state.ragDocuments : []), doc]
                        }));
                    } catch (error) {
                        console.error('Failed to add RAG document:', error);
                    }
                },

                removeRagDocument: async (id: string) => {
                    try {
                        await browserStorage.deleteRagDocument(id);
                        set(state => {
                            const ragDocuments = Array.isArray(state.ragDocuments) ? state.ragDocuments : [];
                            return { ragDocuments: ragDocuments.filter(d => d.id !== id) };
                        });
                    } catch (error) {
                        console.error('Failed to remove RAG document:', error);
                    }
                },
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
                chats: state.chats,
                activeChatId: state.activeChatId,
                agentProvider: state.agentProvider,
                agentModel: state.agentModel,
                agentReadOnly: state.agentReadOnly,
                agentApiKeys: state.agentApiKeys,
                agentProviderKeysValid: state.agentProviderKeysValid,
                agentTemperature: state.agentTemperature,
                agentMaxTokens: state.agentMaxTokens,
                agentUseOrchestration: state.agentUseOrchestration,
            }),
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<AppState> & {
                    chats?: Record<string, AgentChat>;
                    activeChatId?: string | null;
                    agentApiKeyOverride?: string;
                };
                const merged = {
                    ...currentState,
                    ...persisted,
                    customFonts: currentState.customFonts,
                    fontsLoaded: currentState.fontsLoaded,
                };
                // Ensure persisted array/object shapes are valid (avoids "undefined is not iterable" on load)
                if (!Array.isArray(merged.openTabs)) {
                    merged.openTabs = [];
                }
                if (!Array.isArray(merged.files)) {
                    merged.files = [];
                }
                if (!Array.isArray(merged.templates)) {
                    merged.templates = [];
                }
                if (!Array.isArray(merged.fileTree)) {
                    merged.fileTree = [];
                }
                if (!Array.isArray(merged.ragDocuments)) {
                    merged.ragDocuments = [];
                }
                if (!merged.chats || typeof merged.chats !== 'object') {
                    merged.chats = {};
                }
                if (!Array.isArray(merged.agentMessages)) {
                    merged.agentMessages = [];
                }
                if (!merged.pendingDiffs || typeof merged.pendingDiffs !== 'object') {
                    merged.pendingDiffs = {};
                }
                if (!Array.isArray(merged.agentMentionedFiles)) {
                    merged.agentMentionedFiles = [];
                }
                // Migrate old single API key to per-provider keys
                if (!merged.agentApiKeys || typeof merged.agentApiKeys !== 'object') {
                    merged.agentApiKeys = { openai: '', anthropic: '', google: '' };
                    if (persisted.agentApiKeyOverride && typeof persisted.agentApiKeyOverride === 'string') {
                        merged.agentApiKeys.openai = persisted.agentApiKeyOverride;
                    }
                }
                if (!merged.agentProviderKeysValid || typeof merged.agentProviderKeysValid !== 'object') {
                    merged.agentProviderKeysValid = { openai: false, anthropic: false, google: false };
                }
                // In trial-only mode, enforce GPT-4o mini
                if (isTrialOnlyOpenAI(merged.agentApiKeys?.openai ?? '')) {
                    merged.agentModel = TRIAL_MODEL;
                    merged.agentProvider = 'openai';
                }
                // Restore agentMessages and pendingDiffs from active chat
                if (merged.activeChatId && merged.chats?.[merged.activeChatId]) {
                    const chat = merged.chats[merged.activeChatId];
                    merged.agentMessages = chat.messages ?? [];
                    merged.pendingDiffs = chat.pendingDiffs ?? {};
                }
                return merged;
            }
        }
    )
);
