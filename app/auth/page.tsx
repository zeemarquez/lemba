"use client";

import { useEffect, useState, Suspense } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

function AuthContent() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const redirectUri = searchParams.get('redirect_uri');

    const handleSignIn = async () => {
        if (!isFirebaseConfigured()) {
            setStatus('error');
            setErrorMsg('Firebase not configured.');
            return;
        }

        setStatus('loading');
        try {
            const auth = getFirebaseAuth();
            const provider = new GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');

            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);

            if (credential) {
                // If we have a redirect URI (from Electron), construct the deep link
                // containing the credentials to transfer the session.
                if (redirectUri) {
                    const idToken = credential.idToken;
                    const accessToken = credential.accessToken;

                    if (idToken) {
                        setStatus('success');

                        // Construct deep link
                        const deepLink = new URL(redirectUri);
                        deepLink.searchParams.set('id_token', idToken);
                        if (accessToken) {
                            deepLink.searchParams.set('access_token', accessToken);
                        }

                        console.log('Redirecting to:', deepLink.toString());
                        window.location.href = deepLink.toString();
                        return;
                    }
                }
                setStatus('success');
                // If no redirect, just stay signed in or go to home
                window.location.href = '/';
            }
        } catch (err: any) {
            console.error('Sign in failed', err);
            setStatus('error');
            setErrorMsg(err.message || 'Sign in failed');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
            <div className="w-full max-w-sm space-y-4 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Sign In</h1>
                <p className="text-sm text-muted-foreground">
                    Sign in to continue to Modern Markdown Editor
                </p>

                {status === 'error' && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                        {errorMsg}
                    </div>
                )}

                {status === 'success' ? (
                    <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
                        Successfully signed in! Redirecting...
                    </div>
                ) : (
                    <Button
                        onClick={handleSignIn}
                        className="w-full"
                        disabled={status === 'loading'}
                    >
                        {status === 'loading' ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign in with Google'
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <AuthContent />
        </Suspense>
    );
}
