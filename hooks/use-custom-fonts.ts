'use client';

import { useEffect, useState, useRef } from 'react';
import { useStore } from '@/lib/store';

export function useCustomFonts() {
    const customFonts = useStore((state) => state.customFonts);
    const [fontStyles, setFontStyles] = useState<string>('');
    const blobUrlsRef = useRef<string[]>([]);

    useEffect(() => {
        // Revoke old blob URLs before creating new ones
        blobUrlsRef.current.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                // Ignore errors when revoking URLs
            }
        });
        blobUrlsRef.current = [];

        // Only generate font faces if we have fonts
        if (customFonts.length === 0) {
            setFontStyles('');
            return;
        }

        const generateFontFaces = async () => {
            const fontFaces = await Promise.all(
                customFonts.map(async (font) => {
                    // Ensure the blob is valid
                    if (!font.blob || !(font.blob instanceof Blob)) {
                        console.warn(`[useCustomFonts] Invalid blob for font: ${font.family}`);
                        return '';
                    }

                    try {
                        const url = URL.createObjectURL(font.blob);
                        blobUrlsRef.current.push(url);

                        return `
                            @font-face {
                                font-family: '${font.family}';
                                src: url('${url}') format('${font.format}');
                                font-weight: normal;
                                font-style: normal;
                                font-display: swap;
                            }
                        `;
                    } catch (e) {
                        console.error(`[useCustomFonts] Failed to create blob URL for font: ${font.family}`, e);
                        return '';
                    }
                })
            );

            const validFontFaces = fontFaces.filter(face => face !== '');
            setFontStyles(validFontFaces.join('\n'));
        };

        generateFontFaces();

        return () => {
            // Cleanup: revoke all blob URLs when component unmounts or fonts change
            blobUrlsRef.current.forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {
                    // Ignore errors when revoking URLs
                }
            });
            blobUrlsRef.current = [];
        };
    }, [customFonts]);

    useEffect(() => {
        if (!fontStyles) {
            // Remove style element if no fonts
            const styleId = 'custom-fonts-styles';
            const existingElement = document.getElementById(styleId);
            if (existingElement) {
                existingElement.remove();
            }
            return;
        }

        const styleId = 'custom-fonts-styles';
        let styleElement = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }

        styleElement.textContent = fontStyles;

        return () => {
            // We keep the styles as long as the hook is mounted
        };
    }, [fontStyles]);
}
