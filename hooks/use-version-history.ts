'use client';

import { useEffect, useRef } from 'react';
import { debounce } from 'lodash';
import {
    maybeCreateVersion,
    initLastVersionForFile,
    startPeriodicVersionCheck,
} from '@/lib/version-history';

/**
 * Hook to integrate time-based version creation with the editor.
 */
export function useVersionHistory(fileId: string | null, content: string) {
    const initializedForFile = useRef<string | null>(null);
    const fileIdRef = useRef(fileId);
    const contentRef = useRef(content);

    fileIdRef.current = fileId;
    contentRef.current = content;

    const debouncedMaybeCreate = useRef(
        debounce(async (fid: string, c: string) => {
            await maybeCreateVersion(fid, c);
        }, 2500)
    ).current;

    // Initialize last version when file changes
    useEffect(() => {
        if (fileId && content !== undefined) {
            if (initializedForFile.current !== fileId) {
                initLastVersionForFile(fileId, content);
                initializedForFile.current = fileId;
            }
        } else {
            initializedForFile.current = null;
        }
    }, [fileId, content]);

    // Debounced version creation on content change
    useEffect(() => {
        if (!fileId || content === undefined) return;
        debouncedMaybeCreate(fileId, content);
        return () => debouncedMaybeCreate.cancel();
    }, [fileId, content, debouncedMaybeCreate]);

    // 5-minute periodic check (use refs so interval sees current values)
    useEffect(() => {
        if (!fileId) return;
        const cleanup = startPeriodicVersionCheck(
            () => fileIdRef.current,
            () => contentRef.current
        );
        return cleanup;
    }, [fileId]);
}
