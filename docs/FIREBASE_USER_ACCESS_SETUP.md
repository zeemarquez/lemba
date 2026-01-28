# Firebase User Access Management Setup Guide

## Overview

The `users_access` collection manages user permissions for cloud sync features. This collection is **read-only** from the client application for security reasons. Only administrators can modify user access levels using the Firebase Admin SDK.

---

## 1. Collection Creation

**You do NOT need to create the collection manually.** Firestore automatically creates collections when the first document is written. The collection will be created when you add the first user access record via:

- Firebase Admin SDK (recommended)
- Firebase Console (manual)

**Collection Path:** `artifacts/{appId}/users_access/{userId}`

**Document Structure:**
```json
{
  "accessLevel": "basic" | "premium",
  "createdAt": 1706473200000,
  "updatedAt": 1706473200000
}
```

---

## 2. Firestore Security Rules

The security rules have been updated in `firestore.rules`. The `users_access` collection is configured as:

- **Read:** Authenticated users can read their own access level
- **Write:** Denied for all client SDK operations (only Admin SDK can write)

### Deploying the Rules

#### Option A: Using Firebase CLI

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase:**
   ```bash
   firebase login
   ```

3. **Initialize Firebase in your project** (if not already done):
   ```bash
   firebase init firestore
   ```
   - Select your Firebase project
   - Use `firestore.rules` as the rules file

4. **Deploy the rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

#### Option B: Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the contents of `firestore.rules`
5. Paste into the rules editor
6. Click **Publish**

---

## 3. Setting Up Firebase Admin SDK

The Admin SDK bypasses security rules and allows you to write to the `users_access` collection programmatically.

### Step 1: Generate Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the **⚙️ Settings** icon → **Project settings**
4. Go to the **Service accounts** tab
5. Click **Generate new private key**
6. Click **Generate key** in the confirmation dialog
7. Save the downloaded JSON file securely (e.g., `firebase-admin-key.json`)
8. **⚠️ IMPORTANT:** Add this file to `.gitignore` - never commit it to version control!

### Step 2: Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### Step 3: Create Admin Script

Create a new file `scripts/admin-user-access.ts` (or `.js`):

```typescript
import * as admin from 'firebase-admin';
import * as serviceAccount from '../firebase-admin-key.json';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();
const APP_ID = process.env.FIREBASE_APP_ID || 'modern-markdown-editor';

/**
 * Set user access level
 */
async function setUserAccessLevel(
  userId: string,
  accessLevel: 'basic' | 'premium'
): Promise<void> {
  const docRef = db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .doc(userId);

  const now = Date.now();
  
  await docRef.set({
    accessLevel,
    updatedAt: now,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✅ Set user ${userId} to ${accessLevel} access`);
}

/**
 * Get user access level
 */
async function getUserAccessLevel(userId: string): Promise<string | null> {
  const docRef = db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .doc(userId);

  const doc = await docRef.get();
  if (!doc.exists) {
    return null;
  }

  return doc.data()?.accessLevel || null;
}

/**
 * List all users and their access levels
 */
async function listAllUsers(): Promise<void> {
  const snapshot = await db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .get();

  console.log('\n📋 User Access Levels:');
  console.log('─'.repeat(50));
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`User ID: ${doc.id}`);
    console.log(`  Access Level: ${data.accessLevel}`);
    console.log(`  Created: ${data.createdAt?.toDate() || 'N/A'}`);
    console.log(`  Updated: ${data.updatedAt || 'N/A'}`);
    console.log('');
  });
}

// Example usage
async function main() {
  const command = process.argv[2];
  const userId = process.argv[3];
  const accessLevel = process.argv[4] as 'basic' | 'premium';

  try {
    switch (command) {
      case 'set':
        if (!userId || !accessLevel) {
          console.error('Usage: npm run admin:set <userId> <basic|premium>');
          process.exit(1);
        }
        await setUserAccessLevel(userId, accessLevel);
        break;

      case 'get':
        if (!userId) {
          console.error('Usage: npm run admin:get <userId>');
          process.exit(1);
        }
        const level = await getUserAccessLevel(userId);
        console.log(`User ${userId} has ${level || 'no'} access level`);
        break;

      case 'list':
        await listAllUsers();
        break;

      default:
        console.log('Available commands:');
        console.log('  set <userId> <basic|premium>  - Set user access level');
        console.log('  get <userId>                  - Get user access level');
        console.log('  list                          - List all users');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
```

### Step 4: Add Scripts to package.json

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "admin:set": "ts-node scripts/admin-user-access.ts set",
    "admin:get": "ts-node scripts/admin-user-access.ts get",
    "admin:list": "ts-node scripts/admin-user-access.ts list"
  }
}
```

### Step 5: Usage Examples

```bash
# Set a user to premium
npm run admin:set abc123xyz premium

# Get a user's access level
npm run admin:get abc123xyz

# List all users
npm run admin:list
```

---

## 4. Manual Setup via Firebase Console

If you prefer to set access levels manually:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Find the path: `artifacts` → `{your-app-id}` → `users_access`
5. Click **Start collection** (if collection doesn't exist)
6. **Collection ID:** `users_access`
7. **Document ID:** Enter the user's Firebase UID
8. Add fields:
   - `accessLevel` (string): `"basic"` or `"premium"`
   - `createdAt` (timestamp): Current timestamp
   - `updatedAt` (number): Current timestamp in milliseconds

---

## 5. Finding User IDs

To find a user's Firebase UID:

1. Go to **Firebase Console** → **Authentication**
2. View the list of users
3. Copy the **UID** for the user you want to update

Alternatively, you can get it from the browser console when a user is signed in:
```javascript
// In browser console (when user is signed in)
firebase.auth().currentUser.uid
```

---

## 6. Security Best Practices

1. **Never commit service account keys** to version control
2. **Store service account keys** in a secure location (environment variables, secret management)
3. **Limit Admin SDK usage** to server-side scripts or secure backend services
4. **Use environment variables** for sensitive configuration:
   ```typescript
   // Use environment variable instead of importing JSON
   const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
   ```
5. **Restrict Admin SDK access** to trusted administrators only

---

## 7. Troubleshooting

### Error: "Missing or insufficient permissions"
- **Cause:** Security rules not deployed or incorrect
- **Solution:** Deploy the updated `firestore.rules` file

### Error: "Document does not exist"
- **Cause:** User access record hasn't been created yet
- **Solution:** Create the record using Admin SDK or Firebase Console

### Error: "Permission denied" when trying to write from client
- **Expected behavior:** Client SDK cannot write to `users_access` collection
- **Solution:** Use Admin SDK or Firebase Console to update access levels

---

## Summary

- ✅ Collection is created automatically (no manual creation needed)
- ✅ Security rules allow read-only access from client
- ✅ Use Firebase Admin SDK for programmatic write access
- ✅ Use Firebase Console for manual management
- ✅ Never commit service account keys to version control
