"use client";

import { useStore } from "@/lib/store";

export function PrintStyles() {
    const { activeTemplateCss } = useStore();

    if (!activeTemplateCss) return null;

    return (
        <style media="print" dangerouslySetInnerHTML={{
            __html: `
            @page { margin: 2cm; }
            body { 
                visibility: hidden; 
            }
            /* Only show the markdown content area when printing */
            .prose, .prose * {
                visibility: visible;
            }
            .prose {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0 !important;
                max-width: none !important;
            }
            
            /* Apply Custom CSS */
            ${activeTemplateCss}
        `}} />
    );
}
