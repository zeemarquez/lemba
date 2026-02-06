"use client";

import { usePathname } from "next/navigation";
import { ElectronTitleBar } from "./electron-title-bar";

export function LayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isExportPage = pathname === '/export';

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <ElectronTitleBar title={isExportPage ? "Export" : undefined} />
            <div className="flex-1 min-h-0 overflow-hidden">
                {children}
            </div>
        </div>
    );
}
