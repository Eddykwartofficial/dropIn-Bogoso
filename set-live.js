'use strict';
const { initializeApp, applicationDefault } = require('../4-Backend-Functions/functions/node_modules/firebase-admin/app');
const { getFirestore } = require('../4-Backend-Functions/functions/node_modules/firebase-admin/firestore');
if (!['true','false'].includes(process.argv[2])) throw new Error('Usage: node scripts/set-live.js true|false');
initializeApp({ credential:applicationDefault() });
getFirestore().doc('config/operations').set({ liveEnabled:process.argv[2]==='true' },{ merge:true }).then(()=>console.log('Live booking switch updated.')).catch(e=>{console.error(e.message);process.exitCode=1;});
