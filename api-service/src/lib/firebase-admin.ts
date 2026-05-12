/**
 * Lazy Firebase Admin SDK initializer for the API service.
 *
 * The admin SDK is OPTIONAL. When credentials are not configured, all
 * cloud-backed features (`*_cloud_filepath`, the `/v1/me/*` endpoints, and
 * per-user API key auth) simply report `503` / `401`. The legacy shared-secret
 * `API_KEY` env still works without admin SDK.
 *
 * Credentials are loaded from one of:
 *
 *   1. `FIREBASE_SERVICE_ACCOUNT_KEY` env (full service-account JSON as a string)
 *   2. `firebase-admin-key.json` in the working directory
 *   3. Application Default Credentials (e.g. GCP runtime)
 *
 * `FIREBASE_APP_ID` (defaults to `modern-markdown-editor`) must match the
 * `NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID` used by the web app.
 */

import { App, applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const FIREBASE_APP_ID =
    process.env.FIREBASE_APP_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID ||
    'modern-markdown-editor';

let app: App | null = null;
let initAttempted = false;
let lastInitError: Error | null = null;

function tryInitFromEnv(): App | null {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!envKey) return null;
    try {
        const serviceAccount = JSON.parse(envKey);
        return initializeApp({ credential: cert(serviceAccount) });
    } catch (e) {
        lastInitError = e instanceof Error ? e : new Error(String(e));
        console.error('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', lastInitError.message);
        return null;
    }
}

function tryInitFromFile(): App | null {
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
        ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_FILE)
        : path.join(process.cwd(), 'firebase-admin-key.json');
    if (!fs.existsSync(filePath)) return null;
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return initializeApp({ credential: cert(serviceAccount) });
    } catch (e) {
        lastInitError = e instanceof Error ? e : new Error(String(e));
        console.error('[firebase-admin] Failed to load service account file:', lastInitError.message);
        return null;
    }
}

function tryInitDefault(): App | null {
    try {
        return initializeApp({ credential: applicationDefault() });
    } catch (e) {
        lastInitError = e instanceof Error ? e : new Error(String(e));
        return null;
    }
}

export function getFirebaseAdminApp(): App | null {
    if (app) return app;
    if (initAttempted) return null;
    initAttempted = true;

    if (getApps().length > 0) {
        app = getApps()[0]!;
        return app;
    }

    app = tryInitFromEnv() ?? tryInitFromFile() ?? tryInitDefault();
    if (!app) {
        console.warn(
            '[firebase-admin] Not configured. Cloud features and per-user API keys are disabled. ' +
                'Set FIREBASE_SERVICE_ACCOUNT_KEY or provide firebase-admin-key.json to enable.'
        );
    } else {
        console.log('[firebase-admin] Initialized (appId =', FIREBASE_APP_ID, ')');
    }
    return app;
}

export function isFirebaseAdminConfigured(): boolean {
    return getFirebaseAdminApp() !== null;
}

export function getFirebaseAdminFirestore(): Firestore | null {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) return null;
    return getFirestore(adminApp);
}

export function getFirebaseAdminInitError(): string | null {
    return lastInitError ? lastInitError.message : null;
}
