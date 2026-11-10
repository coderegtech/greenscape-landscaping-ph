/* global db */
// Run by mongosh on first start (empty data directory): `db` and `process` are mongosh globals.
// Least-privilege MongoDB user for the API: read/write on the CMS database only; no admin, no other databases.
// The root user exists for operators and backups, never for the app.
const cms = db.getSiblingDB('greenscape');
cms.createUser({ user: 'greenscape_app', pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: 'readWrite', db: 'greenscape' }] });
