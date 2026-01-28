/**
 * Firebase Admin SDK - User Access Management
 * 
 * This script allows you to manage user access levels using the Firebase Admin SDK,
 * which bypasses security rules.
 * 
 * SETUP:
 * 1. Install dependencies: npm install firebase-admin
 * 2. Generate service account key from Firebase Console:
 *    - Go to Firebase Console → Project Settings → Service Accounts
 *    - Click "Generate new private key"
 *    - Save as firebase-admin-key.json in project root
 * 3. Set FIREBASE_APP_ID in .env.local (optional, defaults to 'modern-markdown-editor')
 * 4. Run: npm run admin:list, npm run admin:get <userId>, npm run admin:set <userId> <level>
 * 
 * SECURITY:
 * - Never commit firebase-admin-key.json to version control (already in .gitignore)
 * - Consider using environment variables for production
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin
function initializeAdmin() {
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Try to load service account key
  const keyPath = path.join(process.cwd(), 'firebase-admin-key.json');
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (envKey) {
    // Option 1: Use environment variable (recommended for production)
    try {
      const serviceAccount = JSON.parse(envKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Initialized Firebase Admin from environment variable');
      return admin.app();
    } catch (error) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
      process.exit(1);
    }
  } else if (fs.existsSync(keyPath)) {
    // Option 2: Use JSON file
    try {
      const serviceAccountJson = fs.readFileSync(keyPath, 'utf8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Initialized Firebase Admin from firebase-admin-key.json');
      return admin.app();
    } catch (error) {
      console.error('❌ Failed to load firebase-admin-key.json:', error);
      process.exit(1);
    }
  } else {
    // Option 3: Try default credentials (for Google Cloud environments)
    try {
      admin.initializeApp();
      console.log('✅ Initialized Firebase Admin with default credentials');
      return admin.app();
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin:');
      console.error('   Please provide firebase-admin-key.json or set FIREBASE_SERVICE_ACCOUNT_KEY');
      console.error('   See docs/FIREBASE_USER_ACCESS_SETUP.md for instructions');
      process.exit(1);
    }
  }
}

// Initialize
initializeAdmin();

// Get APP_ID from environment or use default
const APP_ID = process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID || 'modern-markdown-editor';
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
  
  const doc = await docRef.get();
  const isNew = !doc.exists;

  await docRef.set({
    accessLevel,
    updatedAt: now,
    createdAt: doc.exists ? doc.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✅ ${isNew ? 'Created' : 'Updated'} user ${userId} → ${accessLevel} access`);
}

/**
 * Get user access level
 */
async function getUserAccessLevel(userId: string): Promise<{
  accessLevel: string | null;
  exists: boolean;
  createdAt: Date | null;
  updatedAt: number | null;
}> {
  const docRef = db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .doc(userId);

  const doc = await docRef.get();
  
  if (!doc.exists) {
    return {
      accessLevel: null,
      exists: false,
      createdAt: null,
      updatedAt: null,
    };
  }

  const data = doc.data();
  return {
    accessLevel: data?.accessLevel || null,
    exists: true,
    createdAt: data?.createdAt?.toDate?.() || null,
    updatedAt: data?.updatedAt || null,
  };
}

/**
 * List all authenticated users from Firebase Auth
 */
async function listAuthenticatedUsers(): Promise<void> {
  const auth = admin.auth();
  let nextPageToken: string | undefined;
  let allUsers: admin.auth.UserRecord[] = [];
  let hasMore = true;

  console.log('📥 Fetching authenticated users from Firebase Auth...\n');

  try {
    // Firebase Auth listUsers returns max 1000 users at a time, so we need to paginate
    while (hasMore) {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
      hasMore = !!nextPageToken;
    }
  } catch (error: any) {
    console.error('❌ Error fetching authenticated users:', error.message || error);
    throw error;
  }

  if (allUsers.length === 0) {
    console.log('📭 No authenticated users found');
    return;
  }

  console.log(`\n👥 Authenticated Users (${allUsers.length} user${allUsers.length !== 1 ? 's' : ''}):`);
  console.log('═'.repeat(90));
  console.log(`${'User ID'.padEnd(30)} ${'Email'.padEnd(30)} ${'Display Name'.padEnd(20)} ${'Created'.padEnd(20)}`);
  console.log('─'.repeat(90));
  
  allUsers
    .sort((a, b) => (b.metadata.creationTime || '').localeCompare(a.metadata.creationTime || ''))
    .forEach((user) => {
      const userId = user.uid.length > 28 ? user.uid.substring(0, 25) + '...' : user.uid;
      const email = (user.email || 'N/A').padEnd(30);
      const displayName = (user.displayName || 'N/A').padEnd(20);
      const created = user.metadata.creationTime 
        ? new Date(user.metadata.creationTime).toLocaleString().padEnd(20)
        : 'N/A'.padEnd(20);
      
      console.log(`${userId.padEnd(30)} ${email} ${displayName} ${created}`);
    });
  
  console.log('═'.repeat(90));
  console.log(`\n📊 Total: ${allUsers.length} authenticated user${allUsers.length !== 1 ? 's' : ''}`);
}

/**
 * List all users in the users_access collection
 */
async function listUsersAccess(): Promise<void> {
  const snapshot = await db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .orderBy('updatedAt', 'desc')
    .get();

  if (snapshot.empty) {
    console.log('📭 No users found in users_access collection');
    console.log(`   Collection path: artifacts/${APP_ID}/users_access`);
    console.log('   Users not in this collection will default to "basic" access level');
    return;
  }

  console.log(`\n📋 User Access Levels (${snapshot.size} user${snapshot.size !== 1 ? 's' : ''}):`);
  console.log('═'.repeat(70));
  console.log(`${'User ID'.padEnd(30)} ${'Access Level'.padEnd(15)} ${'Updated'.padEnd(20)}`);
  console.log('─'.repeat(70));
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    const accessLevel = data.accessLevel || 'N/A';
    const updatedAt = data.updatedAt 
      ? new Date(data.updatedAt).toLocaleString() 
      : 'N/A';
    const userId = doc.id.length > 28 ? doc.id.substring(0, 25) + '...' : doc.id;
    
    console.log(`${userId.padEnd(30)} ${accessLevel.padEnd(15)} ${updatedAt.padEnd(20)}`);
  });
  
  console.log('═'.repeat(70));
  
  // Summary
  const premiumCount = snapshot.docs.filter(d => d.data().accessLevel === 'premium').length;
  const basicCount = snapshot.docs.filter(d => d.data().accessLevel === 'basic').length;
  console.log(`\n📊 Summary: ${premiumCount} premium, ${basicCount} basic`);
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

  const doc = await docRef.get();
  if (!doc.exists) {
    console.log(`ℹ️  User ${userId} not found in users_access collection`);
    return;
  }

  await docRef.delete();
  console.log(`✅ Deleted access record for user ${userId}`);
}

/**
 * Batch update multiple users
 */
async function batchUpdateUsers(updates: Array<{ userId: string; accessLevel: 'basic' | 'premium' }>): Promise<void> {
  if (updates.length === 0) {
    console.log('ℹ️  No users to update');
    return;
  }

  const batch = db.batch();
  const now = Date.now();

  for (const { userId, accessLevel } of updates) {
    if (!['basic', 'premium'].includes(accessLevel)) {
      throw new Error(`Invalid access level "${accessLevel}" for user ${userId}`);
    }

    const docRef = db
      .collection('artifacts')
      .doc(APP_ID)
      .collection('users_access')
      .doc(userId);

    batch.set(docRef, {
      accessLevel,
      updatedAt: now,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`✅ Batch updated ${updates.length} user${updates.length !== 1 ? 's' : ''}`);
}

/**
 * Update users: Add authenticated users that are missing from users_access collection
 * Sets them to "basic" access level by default
 */
async function updateUsers(): Promise<void> {
  const auth = admin.auth();
  let nextPageToken: string | undefined;
  let allAuthUsers: admin.auth.UserRecord[] = [];
  let hasMore = true;

  console.log('📥 Fetching authenticated users from Firebase Auth...\n');

  try {
    // Get all authenticated users
    while (hasMore) {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allAuthUsers = allAuthUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
      hasMore = !!nextPageToken;
    }
  } catch (error: any) {
    console.error('❌ Error fetching authenticated users:', error.message || error);
    throw error;
  }

  if (allAuthUsers.length === 0) {
    console.log('📭 No authenticated users found');
    return;
  }

  console.log(`✅ Found ${allAuthUsers.length} authenticated user${allAuthUsers.length !== 1 ? 's' : ''}`);
  console.log('📥 Checking users_access collection...\n');

  // Get all users in users_access collection
  const accessSnapshot = await db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users_access')
    .get();

  const existingUserIds = new Set(accessSnapshot.docs.map(doc => doc.id));
  console.log(`✅ Found ${existingUserIds.size} user${existingUserIds.size !== 1 ? 's' : ''} in users_access collection`);

  // Find users that are authenticated but not in users_access
  const missingUsers = allAuthUsers.filter(user => !existingUserIds.has(user.uid));

  if (missingUsers.length === 0) {
    console.log('\n✅ All authenticated users already have access records');
    console.log('   No updates needed.');
    return;
  }

  console.log(`\n📋 Found ${missingUsers.length} authenticated user${missingUsers.length !== 1 ? 's' : ''} missing from users_access collection:`);
  console.log('─'.repeat(70));
  
  missingUsers.forEach((user, index) => {
    const email = user.email || 'N/A';
    const displayName = user.displayName || 'N/A';
    console.log(`${(index + 1).toString().padStart(3)}. ${user.uid} - ${email} (${displayName})`);
  });
  console.log('─'.repeat(70));

  // Batch add missing users with "basic" access level
  const batch = db.batch();
  const now = Date.now();
  let addedCount = 0;

  // Firestore batch operations are limited to 500 writes
  const batchSize = 500;
  const batches: Array<Array<admin.auth.UserRecord>> = [];

  for (let i = 0; i < missingUsers.length; i += batchSize) {
    batches.push(missingUsers.slice(i, i + batchSize));
  }

  console.log(`\n📝 Adding ${missingUsers.length} user${missingUsers.length !== 1 ? 's' : ''} to users_access collection with "basic" access...\n`);

  for (const batchUsers of batches) {
    const currentBatch = db.batch();

    for (const user of batchUsers) {
      const docRef = db
        .collection('artifacts')
        .doc(APP_ID)
        .collection('users_access')
        .doc(user.uid);

      currentBatch.set(docRef, {
        accessLevel: 'basic',
        updatedAt: now,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await currentBatch.commit();
    addedCount += batchUsers.length;
    console.log(`   ✅ Added ${addedCount}/${missingUsers.length} users...`);
  }

  console.log(`\n✅ Successfully added ${addedCount} user${addedCount !== 1 ? 's' : ''} to users_access collection`);
  console.log(`   All new users have been set to "basic" access level`);
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log('\n📖 Firebase Admin - User Access Management\n');
  console.log('Available commands:\n');
  console.log('  users                          List all authenticated users (Firebase Auth)');
  console.log('  access                         List users in users_access collection');
  console.log('  update                         Add missing authenticated users to users_access (as basic)');
  console.log('  get <userId>                   Get access level for a specific user');
  console.log('  set <userId> <basic|premium>   Set user access level');
  console.log('  delete <userId>                Delete user access record');
  console.log('  help, --help, -h              Show this help message\n');
  console.log('Usage Examples:\n');
  console.log('  npm run admin:users             # List all authenticated users');
  console.log('  npm run admin:access            # List users with access records');
  console.log('  npm run admin:update            # Sync missing users to users_access');
  console.log('  npm run admin:get abc123xyz     # Get user access level');
  console.log('  npm run admin:set abc123xyz premium  # Set user to premium');
  console.log('  npm run admin:set abc123xyz basic    # Set user to basic');
  console.log('  npm run admin:delete abc123xyz  # Delete user access record');
  console.log('  npm run admin:help             # Show this help\n');
  console.log('Description:\n');
  console.log('  This tool manages user access levels for the Modern Markdown Editor.');
  console.log('  Users not in the users_access collection default to "basic" access.');
  console.log('  Only "premium" users have access to cloud sync features.\n');
  console.log(`Current Configuration:\n`);
  console.log(`  APP_ID: ${APP_ID}`);
  console.log(`  Collection Path: artifacts/${APP_ID}/users_access\n`);
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
          console.error('   Example: npm run admin:set abc123xyz premium');
          process.exit(1);
        }
        await setUserAccessLevel(userId, accessLevel);
        break;

      case 'get':
        if (!userId) {
          console.error('❌ Usage: npm run admin:get <userId>');
          console.error('   Example: npm run admin:get abc123xyz');
          process.exit(1);
        }
        const userInfo = await getUserAccessLevel(userId);
        if (userInfo.exists) {
          console.log(`\n👤 User: ${userId}`);
          console.log(`   Access Level: ${userInfo.accessLevel || 'N/A'}`);
          console.log(`   Created: ${userInfo.createdAt?.toLocaleString() || 'N/A'}`);
          console.log(`   Updated: ${userInfo.updatedAt ? new Date(userInfo.updatedAt).toLocaleString() : 'N/A'}`);
        } else {
          console.log(`\nℹ️  User ${userId} not found in users_access collection`);
          console.log(`   Default access level: basic (no sync access)`);
        }
        break;

      case 'users':
        await listAuthenticatedUsers();
        break;

      case 'access':
        await listUsersAccess();
        break;

      case 'update':
        await updateUsers();
        break;

      case 'delete':
        if (!userId) {
          console.error('❌ Usage: npm run admin:delete <userId>');
          console.error('   Example: npm run admin:delete abc123xyz');
          process.exit(1);
        }
        await deleteUserAccess(userId);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        if (!command) {
          // No command provided - show help
          showHelp();
        } else {
          console.error(`\n❌ Unknown command: ${command}\n`);
          showHelp();
        }
        process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close Firebase Admin connection
    await admin.app().delete();
  }
}

// Run the main function
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
