'use client';

/**
 * Manage API keys for the external PDF API / MCP service.
 *
 * Authenticated users can mint API key tokens here and use them to authenticate
 * against the api-service (`Authorization: Bearer <token>` or `x-api-key`).
 * The plaintext token is shown exactly once after creation.
 */

import * as React from 'react';
import { Copy, Loader2, Plus, Trash2, Check, KeyRound, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/plate-ui/button';
import { Input } from '@/components/plate-ui/input';
import { useAuth } from '@/components/auth';
import {
    createApiKey,
    deleteApiKey,
    listApiKeys,
    type ApiKey,
} from '@/lib/firebase';

function formatDate(ms: number): string {
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return '';
    }
}

function maskToken(token: string): string {
    if (!token) return '';
    const last = token.slice(-4);
    return `mme_${'\u2022'.repeat(8)}${last}`;
}

export function ApiKeysPanel() {
    const { user, isConfigured, isLoading: authLoading } = useAuth();
    const [keys, setKeys] = React.useState<ApiKey[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [newKeyName, setNewKeyName] = React.useState('');
    const [justCreated, setJustCreated] = React.useState<ApiKey | null>(null);
    const [copiedToken, setCopiedToken] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [deletingToken, setDeletingToken] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        if (!user) {
            setKeys([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const fetched = await listApiKeys(user.uid);
            setKeys(fetched);
        } catch (e) {
            console.error('[ApiKeysPanel] list failed', e);
            setError(e instanceof Error ? e.message : 'Failed to load API keys');
        } finally {
            setLoading(false);
        }
    }, [user]);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    const handleCreate = async () => {
        if (!user) return;
        setCreating(true);
        setError(null);
        try {
            const created = await createApiKey(user.uid, newKeyName || 'API key');
            setJustCreated(created);
            setNewKeyName('');
            await refresh();
        } catch (e) {
            console.error('[ApiKeysPanel] create failed', e);
            setError(e instanceof Error ? e.message : 'Failed to create API key');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (token: string) => {
        if (!confirm('Revoke this API key? Any client using it will stop working.')) {
            return;
        }
        setDeletingToken(token);
        setError(null);
        try {
            await deleteApiKey(token);
            if (justCreated?.token === token) setJustCreated(null);
            await refresh();
        } catch (e) {
            console.error('[ApiKeysPanel] delete failed', e);
            setError(e instanceof Error ? e.message : 'Failed to revoke API key');
        } finally {
            setDeletingToken(null);
        }
    };

    const handleCopy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(token);
            setCopiedToken(token);
            setTimeout(() => setCopiedToken(prev => (prev === token ? null : prev)), 1500);
        } catch (e) {
            console.error('[ApiKeysPanel] copy failed', e);
        }
    };

    if (!isConfigured) {
        return (
            <div className="rounded-md border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                Firebase is not configured for this build, so API keys are unavailable.
            </div>
        );
    }

    if (authLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
        );
    }

    if (!user) {
        return (
            <div className="rounded-md border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                Sign in to generate API keys for the PDF API and MCP service.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                    <KeyRound className="size-4" /> Personal API tokens
                </h4>
                <p className="text-sm text-muted-foreground">
                    Use a token to authenticate against the PDF API and MCP server. Send it as
                    <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>
                    or in the <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">x-api-key</code> header.
                    Authenticated requests can reference your cloud-saved markdown, templates, and fonts directly.
                </p>
            </div>

            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                <p className="text-sm font-medium">Create a new key</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                        placeholder="Key name (e.g. 'CI', 'Notebook', 'Cursor MCP')"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        disabled={creating}
                        className="sm:flex-1"
                    />
                    <Button onClick={handleCreate} disabled={creating}>
                        {creating ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Plus className="size-4" />
                        )}
                        <span className="ml-2">Generate</span>
                    </Button>
                </div>
                {justCreated && (
                    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/20">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-4" />
                            Copy this token now — it is shown only once.
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={justCreated.token}
                                className="font-mono text-xs"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCopy(justCreated.token)}
                                title="Copy token"
                            >
                                {copiedToken === justCreated.token ? (
                                    <Check className="size-4 text-green-600" />
                                ) : (
                                    <Copy className="size-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Your tokens</h4>
                    <span className="text-xs text-muted-foreground">
                        {keys.length} {keys.length === 1 ? 'token' : 'tokens'}
                    </span>
                </div>
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Loading…
                    </div>
                ) : keys.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                        No API tokens yet. Generate one above to get started.
                    </div>
                ) : (
                    <div className="divide-y rounded-md border bg-muted/10">
                        {keys.map((key) => (
                            <div
                                key={key.token}
                                className="flex items-center justify-between gap-3 p-3"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium">
                                        {key.name || 'API key'}
                                    </span>
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                        {maskToken(key.token)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        Created {formatDate(key.createdAt)}
                                        {key.lastUsedAt
                                            ? ` · Last used ${formatDate(key.lastUsedAt)}`
                                            : ''}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(key.token)}
                                    disabled={deletingToken === key.token}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    title="Revoke"
                                >
                                    {deletingToken === key.token ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="size-4" />
                                    )}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
