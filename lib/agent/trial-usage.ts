/**
 * Trial usage tracking for free trial API key
 * Enforces 1M token limit per user (Firebase UID when signed in, device ID when anonymous)
 */

import { getCurrentUserId } from '../firebase/auth';

const TRIAL_TOKEN_LIMIT = 1_000_000;
const DEVICE_ID_KEY = 'trial_device_id';

function getDeviceId(): string {
    if (typeof window === 'undefined') return 'anonymous';
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/**
 * Get the user ID for trial usage tracking.
 * Uses Firebase UID when signed in, otherwise a persistent device ID.
 */
export function getTrialUserId(): string {
    const uid = getCurrentUserId();
    if (uid) return uid;
    return getDeviceId();
}

function getStorageKey(userId: string): string {
    return `trial_tokens_${userId}`;
}

/**
 * Get current token usage for a user
 */
export function getTrialTokenUsage(userId: string): number {
    if (typeof window === 'undefined') return 0;
    try {
        const raw = localStorage.getItem(getStorageKey(userId));
        const n = parseInt(raw ?? '0', 10);
        return isNaN(n) ? 0 : n;
    } catch {
        return 0;
    }
}

/**
 * Add token usage and persist. Returns new total.
 */
export function addTrialTokenUsage(userId: string, tokens: number): number {
    if (typeof window === 'undefined') return 0;
    const current = getTrialTokenUsage(userId);
    const next = Math.min(current + tokens, TRIAL_TOKEN_LIMIT); // cap stored value
    try {
        localStorage.setItem(getStorageKey(userId), String(next));
    } catch {
        // ignore quota errors
    }
    return next;
}

/**
 * Check if the user is within the trial limit.
 * Returns { allowed, used, remaining }.
 */
export function checkTrialLimit(userId: string): { allowed: boolean; used: number; remaining: number } {
    const used = getTrialTokenUsage(userId);
    const remaining = Math.max(0, TRIAL_TOKEN_LIMIT - used);
    return {
        allowed: used < TRIAL_TOKEN_LIMIT,
        used,
        remaining,
    };
}

export { TRIAL_TOKEN_LIMIT };
