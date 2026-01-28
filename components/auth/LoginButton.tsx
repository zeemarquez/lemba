'use client';

/**
 * Login Button Component
 * 
 * Displays sign-in button or user info based on auth state.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from './AuthProvider';
import { LogIn, LogOut, User, Cloud, CloudOff, Loader2 } from 'lucide-react';

interface LoginButtonProps {
    className?: string;
    showLabel?: boolean;
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Login Button Component
 */
export function LoginButton({ 
    className, 
    showLabel = true,
    size = 'default' 
}: LoginButtonProps) {
    const { user, isLoading, isConfigured, signIn, signOut, error } = useAuth();
    const [isSigningIn, setIsSigningIn] = useState(false);

    // Handle sign in
    const handleSignIn = async () => {
        setIsSigningIn(true);
        try {
            await signIn();
        } catch (err) {
            // Error is handled in AuthProvider
        } finally {
            setIsSigningIn(false);
        }
    };

    // Handle sign out
    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (err) {
            // Error is handled in AuthProvider
        }
    };

    // Firebase not configured
    if (!isConfigured) {
        return (
            <Button
                variant="ghost"
                size={size}
                className={className}
                disabled
                title="Cloud sync not configured"
            >
                <CloudOff className="h-4 w-4" />
                {showLabel && <span className="ml-2">Offline</span>}
            </Button>
        );
    }

    // Loading state
    if (isLoading || isSigningIn) {
        return (
            <Button
                variant="ghost"
                size={size}
                className={className}
                disabled
            >
                <Loader2 className="h-4 w-4 animate-spin" />
                {showLabel && <span className="ml-2">Loading...</span>}
            </Button>
        );
    }

    // Not signed in
    if (!user) {
        return (
            <Button
                variant="outline"
                size={size}
                className={className}
                onClick={handleSignIn}
                title="Sign in with Google to enable cloud sync"
            >
                <LogIn className="h-4 w-4" />
                {showLabel && <span className="ml-2">Sign In</span>}
            </Button>
        );
    }

    // Signed in - show user dropdown
    const initials = user.displayName
        ?.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size={size === 'icon' ? 'icon' : size}
                    className={className}
                    title={user.email || 'User menu'}
                >
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    {showLabel && size !== 'icon' && (
                        <span className="ml-2 max-w-[100px] truncate">
                            {user.displayName || user.email}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate">
                            {user.displayName || 'User'}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                            {user.email}
                        </span>
                    </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" disabled>
                    <Cloud className="h-4 w-4" />
                    <span>Cloud sync enabled</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={handleSignOut}
                >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
