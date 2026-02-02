/**
 * [AI Agent] Console debugging - filter in DevTools by "AI Agent"
 */

const PREFIX = '[AI Agent]';

export const agentLog = {
    info: (message: string, ...args: unknown[]) => {
        console.log(PREFIX, message, ...args);
    },
    step: (message: string, ...args: unknown[]) => {
        console.log(PREFIX, '→', message, ...args);
    },
    tool: (name: string, args?: unknown, result?: unknown) => {
        console.log(PREFIX, '🔧', name, args !== undefined ? { args } : '', result !== undefined ? { result: typeof result === 'string' && result.length > 200 ? result.slice(0, 200) + '…' : result } : '');
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(PREFIX, message, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(PREFIX, message, ...args);
    },
    group: (label: string, fn: () => void) => {
        console.group(PREFIX, label);
        try {
            fn();
        } finally {
            console.groupEnd();
        }
    },
};
