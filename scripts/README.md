# Admin Scripts

This directory contains administrative scripts for managing Firebase user access levels.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate Firebase Admin Service Account Key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Navigate to **Project Settings** → **Service Accounts**
   - Click **Generate new private key**
   - Save the downloaded JSON file as `firebase-admin-key.json` in the project root
   - ⚠️ **Never commit this file** (already in `.gitignore`)

3. **Optional: Set environment variables:**
   - `FIREBASE_APP_ID` - Your Firebase app ID (defaults to 'modern-markdown-editor')
   - `FIREBASE_SERVICE_ACCOUNT_KEY` - JSON string of service account key (alternative to file)

## Usage

### List authenticated users
```bash
npm run admin:users
```

Shows all users who have authenticated with Firebase Auth (email, display name, creation date).

### List users with access records
```bash
npm run admin:access
```

Shows all users in the `users_access` collection with their access levels (basic/premium).

### Update users (sync missing users)
```bash
npm run admin:update
```

Finds authenticated users that are not in the `users_access` collection and adds them with "basic" access level. This is useful for:
- Initial setup when you have existing authenticated users
- Keeping the access collection in sync with authenticated users
- Bulk adding new users who signed in but don't have access records yet

### Get user access level
```bash
npm run admin:get <userId>
```

Example:
```bash
npm run admin:get abc123xyz
```

### Set user access level
```bash
npm run admin:set <userId> <basic|premium>
```

Examples:
```bash
npm run admin:set abc123xyz premium
npm run admin:set abc123xyz basic
```

### Delete user access record
```bash
npm run admin:delete <userId>
```

Example:
```bash
npm run admin:delete abc123xyz
```

### Show help
```bash
npm run admin:help
```

Or use any of these:
```bash
npm run admin:help
npm run admin -- --help
npm run admin -- -h
```

Shows all available commands, usage examples, and current configuration.

## Examples

```bash
# List all authenticated users (from Firebase Auth)
npm run admin:users

# List users with access records (from users_access collection)
npm run admin:access

# Sync missing authenticated users to users_access (adds as basic)
npm run admin:update

# Check a specific user's access
npm run admin:get abc123xyz

# Upgrade user to premium
npm run admin:set abc123xyz premium

# Downgrade user to basic
npm run admin:set abc123xyz basic

# Remove user access record (will default to basic)
npm run admin:delete abc123xyz
```

## Troubleshooting

### Error: "Failed to initialize Firebase Admin"
- Make sure `firebase-admin-key.json` exists in the project root
- Or set `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable
- See `docs/FIREBASE_USER_ACCESS_SETUP.md` for detailed instructions

### Error: "Permission denied"
- Verify the service account key has proper permissions
- Check that Firestore is enabled in your Firebase project

### Error: "Collection not found"
- The collection is created automatically when you add the first user
- Run `npm run admin:set <userId> premium` to create the first record

## Security Notes

- Admin scripts bypass Firestore security rules
- Only run these scripts from trusted environments
- Never commit service account keys to version control
- Use environment variables for production deployments
