'use client';

/**
 * Sync Status Component
 * 
 * Displays the current sync status with visual indicators.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSync } from '@/hooks/use-sync';
import { useAuth } from '@/components/auth';
import { 
    Cloud, 
    CloudOff, 
    RefreshCw, 
    Check, 
    AlertCircle,
    Loader2,
    CloudUpload,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncStatusProps {
    className?: string;
    showLabel?: boolean;
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
    if (timestamp === 0) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Sync Status Component
 */
export function SyncStatus({ 
    className, 
    showLabel = false,
    size = 'icon' 
}: SyncStatusProps) {
    const { user, isConfigured, hasSyncAccess } = useAuth();
    const { 
        status, 
        isActive, 
        isSyncing, 
        lastSyncTime, 
        pendingCount,
        syncNow,
        error 
    } = useSync();

    // Not configured
    if (!isConfigured) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={cn('text-muted-foreground', className)}
                            disabled
                        >
                            <CloudOff className="h-4 w-4" />
                            {showLabel && <span className="ml-2">Offline</span>}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Cloud sync not configured</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Not signed in
    if (!user) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={cn('text-muted-foreground', className)}
                            disabled
                        >
                            <CloudOff className="h-4 w-4" />
                            {showLabel && <span className="ml-2">Not synced</span>}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Sign in to enable cloud sync</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Basic user - no sync access
    if (!hasSyncAccess) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={cn('text-muted-foreground', className)}
                            disabled
                        >
                            <CloudOff className="h-4 w-4" />
                            {showLabel && <span className="ml-2">Sync disabled</span>}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Cloud sync requires Premium account</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Get status icon and color
    const getStatusIcon = () => {
        if (isSyncing) {
            return <Loader2 className="h-4 w-4 animate-spin" />;
        }
        if (error || status === 'error') {
            return <AlertCircle className="h-4 w-4 text-destructive" />;
        }
        if (pendingCount > 0) {
            return <CloudUpload className="h-4 w-4 text-yellow-500" />;
        }
        return <Cloud className="h-4 w-4 text-green-500" />;
    };

    const getStatusText = () => {
        if (isSyncing) return 'Syncing...';
        if (error || status === 'error') return 'Sync error';
        if (pendingCount > 0) return `${pendingCount} pending`;
        return 'Synced';
    };

    return (
        <DropdownMenu>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size={size}
                                className={className}
                            >
                                {getStatusIcon()}
                                {showLabel && <span className="ml-2">{getStatusText()}</span>}
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{getStatusText()}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-56">
                <div className="p-2">
                    <div className="flex items-center gap-2">
                        {getStatusIcon()}
                        <span className="text-sm font-medium">{getStatusText()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {formatRelativeTime(lastSyncTime)}
                    </p>
                    {error && (
                        <p className="text-xs text-destructive mt-1">
                            {error.message}
                        </p>
                    )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                    className="gap-2"
                    onClick={() => syncNow()}
                    disabled={isSyncing}
                >
                    <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                    <span>Sync now</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
