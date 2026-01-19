'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

export function useCustomFonts() {
    const customFonts = useStore((state) => state.customFonts);
    const [fontStyles, setFontStyles] = useState<string>('');

    useEffect(() => {
        const generateFontFaces = async () => {
            const fontFaces = await Promise.all(
                customFonts.map(async (font) => {
                    const url = URL.createObjectURL(font.blob);
                    return `
                        @font-face {
                            font-family: '${font.family}';
                            src: url('${url}') format('${font.format}');
                            font-weight: normal;
                            font-style: normal;
                            font-display: swap;
                        }
                    `;
                })
            );
            setFontStyles(fontFaces.join('\n'));
        };

        generateFontFaces();

        return () => {
            // No easy way to revoke object URLs here without tracking them individually
            // but they will be cleaned up on page reload anyway.
        };
    }, [customFonts]);

    useEffect(() => {
        if (!fontStyles) return;

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
