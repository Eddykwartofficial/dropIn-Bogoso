'use strict';
const { initializeApp, applicationDefault } = require('../4-Backend-Functions/functions/node_modules/firebase-admin/app');
const { getAuth } = require('../4-Backend-Functions/functions/node_modules/firebase-admin/auth');
const uid = process.argv[2];
if (!uid) throw new Error('Usage: node scripts/set-admin.js FIREBASE_AUTH_UID');
initializeApp({ credential:applicationDefault() });
(async () => { const user=await getAuth().getUser(uid); await getAuth().setCustomUserClaims(uid,{ ...user.customClaims,admin:true }); console.log('Admin claim assigned to specified Firebase UID. Sign out and sign in again.'); })().catch(e=>{ console.error(e.message);process.exitCode=1; });
