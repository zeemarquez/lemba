/**
 * Firebase Admin SDK - User Access Management
 * 
 * This script allows you to manage user access levels using the Firebase Admin SDK,
 * which bypasses security rules.
 * 
 * SETUP:
 * 1. Install dependencies: npm install firebase-admin
 * 2. Generate service account key from Firebase Console
 * 3. Save it as firebase-admin-key.json (or use environment variable)
 * 4. Copy this file to admin-user-access.ts and update the import path
 * 5. Run: npm run admin:set <userId> <basic|premium>
 * 
 * SECURITY:
 * - Never commit firebase-admin-key.json to version control
 * - Add it to .gitignore
 * - Consider using environment variables instead
 */

import * as admin from 'firebase-admin';

// Option 1: Import from JSON file (not recommended for production)
// import * as serviceAccount from '../firebase-admin-key.json';

// Option 2: Use environment variable (recommended)
// const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

// Initialize Firebase Admin
// For Option 1:
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
// });

// For Option 2 (environment variable):
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// For Option 3 (using default credentials - if running on Google Cloud):
// admin.initializeApp();

// Get APP_ID from environment or use default
const APP_ID = process.env.FIREBASE_APP_ID || 'modern-markdown-editor';
const db = admin.firestore();

/**
 * Set user access level
 */
async function setUserAccessLevel(
  userId: string,
  accessLevel: 'basic' | 'premium'
): Promise<void> {
  if (!['basic', 'premium'].includes(accessLevel)) {
    throw new Error('Access level must be "basic" or "premium"');
  }

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

  if (snapshot.empty) {
    console.log('No users found in users_access collection');
    return;
  }

  console.log('\n📋 User Access Levels:');
  console.log('─'.repeat(50));
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`User ID: ${doc.id}`);
    console.log(`  Access Level: ${data.accessLevel || 'N/A'}`);
    console.log(`  Created: ${data.createdAt?.toDate?.() || data.createdAt || 'N/A'}`);
    console.log(`  Updated: ${data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'N/A'}`);
    console.log('');
  });
}

/**
 * Delete user access record
 */
async function deleteUserAccess(userId: string): Promise<void> {
  const docRef = db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .doc(userId);

  await docRef.delete();
  console.log(`✅ Deleted access record for user ${userId}`);
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const userId = process.argv[3];
  const accessLevel = process.argv[4] as 'basic' | 'premium';

  try {
    switch (command) {
      case 'set':
        if (!userId || !accessLevel) {
          console.error('❌ Usage: npm run admin:set <userId> <basic|premium>');
          process.exit(1);
        }
        await setUserAccessLevel(userId, accessLevel);
        break;

      case 'get':
        if (!userId) {
          console.error('❌ Usage: npm run admin:get <userId>');
          process.exit(1);
        }
        const level = await getUserAccessLevel(userId);
        if (level) {
          console.log(`✅ User ${userId} has ${level} access level`);
        } else {
          console.log(`ℹ️  No access record found for user ${userId} (defaults to basic)`);
        }
        break;

      case 'list':
        await listAllUsers();
        break;

      case 'delete':
        if (!userId) {
          console.error('❌ Usage: npm run admin:delete <userId>');
          process.exit(1);
        }
        await deleteUserAccess(userId);
        break;

      default:
        console.log('📖 Available commands:\n');
        console.log('  set <userId> <basic|premium>  - Set user access level');
        console.log('  get <userId>                  - Get user access level');
        console.log('  list                          - List all users');
        console.log('  delete <userId>               - Delete user access record\n');
        console.log('Examples:');
        console.log('  npm run admin:set abc123xyz premium');
        console.log('  npm run admin:get abc123xyz');
        console.log('  npm run admin:list');
        process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message || error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}
