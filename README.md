# Hush: private messages (text only)

A small Instagram-DM-style chat: log in, see your chats, send text. Invite code required to sign up, so only people you give the code to can join.

## Put it online (about 10 minutes)
1. Create a new GitHub repository and upload everything in this folder.
2. On vercel.com: Add New > Project > import that repository > Deploy.
3. In the Vercel project: Storage > Create > Upstash Redis (free) > connect it to the project.
4. Settings > Environment Variables > add `INVITE_CODE` = a secret word of your choice (Production). Redeploy.
5. Open the site, tap "Create an account", enter a username, password and the invite code. Your friend does the same.

## Notes
- Text only, up to 1000 characters per message. Messages refresh every 2 seconds.
- Passwords are stored hashed. Messages are stored in your Upstash database, so only share the invite code with people you trust.
- Change the invite code in Vercel to stop new sign-ups.
- On a phone, open the site and choose "Add to Home Screen" to use it like an app.
