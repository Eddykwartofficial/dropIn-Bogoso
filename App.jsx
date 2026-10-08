import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getFirestore, collection, query, limit, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref as storageRef, getBlob } from 'firebase/storage';
import './style.css';

const config = {
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
const configured = Object.values(config).every(Boolean);
let auth, db, functions, storage;
if (configured) {
    const app = initializeApp(config);
    storage = getStorage(app); auth = getAuth(app); db = getFirestore(app); functions = getFunctions(app, 'europe-west1');
    if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) initializeAppCheck(app, { provider:new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled:true });
}
const money = n => 'GH₵ ' + (Number(n || 0)/100).toFixed(2);
export default function App() {
    const [user,setUser] = useState(null), [verified,setVerified] = useState(false);
    const [email,setEmail] = useState(''), [password,setPassword] = useState('');
    const [rides,setRides] = useState([]), [drivers,setDrivers] = useState([]);
    const [error,setError] = useState(''), [message,setMessage] = useState(''), [busy,setBusy] = useState(false);
    const [settings,setSettings] = useState({ basePesewas:800,perKmPesewas:350,perMinutePesewas:0,minimumPesewas:1500,commissionPercent:15 });
    const [live,setLive] = useState(false);
    useEffect(() => {
        if (!configured) return;
        return onAuthStateChanged(auth, async u => {
            setUser(u); setVerified(false); setRides([]);setDrivers([]);
            if (u) { try { const result = await u.getIdTokenResult(true); setVerified(result.claims.admin === true); } catch (e) { setError(e.message); } }
        });
    },[]);
    useEffect(() => {
        if (!verified) return;
        const fail = e => setError(e.message);
        const unsub = [
            onSnapshot(query(collection(db,'rides'),orderBy('createdAt','desc'),limit(100)),s=>setRides(s.docs.map(d=>({ ...d.data(),id:d.id }))),fail),
            onSnapshot(query(collection(db,'drivers'),orderBy('createdAt','desc'),limit(100)),s=>setDrivers(s.docs.map(d=>({ ...d.data(),id:d.id }))),fail),
            onSnapshot(doc(db,'config/operations'),s=>{ if (s.exists()) { const d=s.data();setSettings(prev=>Object.fromEntries(Object.keys(prev).map(k=>[k,d[k]??prev[k]])));setLive(d.liveEnabled===true); } },fail),
        ];
        return () => unsub.forEach(u=>u());
    },[verified]);
    async function viewDocument(path) {
        const windowHandle = window.open('', '_blank');
        try {
            const blob = await getBlob(storageRef(storage, path), 5*1024*1024);
            const url = URL.createObjectURL(blob);
            if (windowHandle) windowHandle.location.href = url;
            else { URL.revokeObjectURL(url); throw new Error('Allow popups to view this document.'); }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) { windowHandle?.close(); setError(e.message); }
    }
    async function act(name,data) {
        setBusy(true);setError('');setMessage('');
        try { await httpsCallable(functions,name)(data);setMessage('Saved successfully.'); }
        catch(e) { setError(e.message); }
        finally { setBusy(false); }
    }
    if (!configured) return <main><h1>DropIn Ghana admin</h1><p>Firebase is not configured. Copy .env.example to .env and enter your Firebase web app configuration. See FIREBASE-SETUP-GUIDE.md.</p></main>;
    if (!user) return <main className="login"><h1>DropIn Ghana</h1><p>Operator sign in</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await signInWithEmailAndPassword(auth,email,password);}catch(e){setError(e.message);}finally{setBusy(false);}}}><label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form>{error&&<p role="alert">{error}</p>}</main>;
    if (!verified) return <main><h1>Administrator access required</h1><p>This account has no admin claim. The project owner must provision access with scripts/set-admin.js.</p><button onClick={()=>signOut(auth)}>Sign out</button></main>;
    const completed=rides.filter(r=>r.status==='completed');
    return <main><header><div><h1>DropIn Ghana</h1><p>Firebase operations · {live?'Live enabled':'Live bookings disabled'}</p></div><button onClick={()=>signOut(auth)}>Sign out</button></header>{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}<p>Showing the latest 100 rides and latest 100 driver profiles. Summary totals reflect this visible window only.</p><div className="stats"><article><span>Completed</span><strong>{completed.length}</strong></article><article><span>Completed gross fares</span><strong>{money(completed.reduce((s,r)=>s+r.farePesewas,0))}</strong></article><article><span>Online drivers in window</span><strong>{drivers.filter(d=>d.online).length}</strong></article></div>
    <section><h2>Ride management</h2><div className="scroll"><table><thead><tr><th>ID / route</th><th>Status</th><th>Fare / payment</th><th>Driver</th><th>Actions</th></tr></thead><tbody>{rides.map(r=><tr key={r.id}><td><small>{r.id}</small><br/>{r.pickup.name} → {r.dropoff.name}</td><td>{r.status}</td><td>{money(r.farePesewas)}<br/>{r.payment} · {r.paymentStatus || 'pending'}</td><td>{r.driverName||'Unassigned'}</td><td>{r.status==='searching'&&<button disabled={busy} onClick={()=>act('findNearestDriver',{rideId:r.id})}>Retry dispatch</button>}{['searching','offered','accepted','arrived'].includes(r.status)&&<button disabled={busy} onClick={()=>{if(window.confirm('Cancel this ride?'))act('updateRideStatus',{rideId:r.id,status:'cancelled'});}}>Cancel ride</button>}</td></tr>)}</tbody></table></div></section>
    <section><h2>Driver applications & verification</h2><p>Open each uploaded document and verify identity, driving licence, insurance, roadworthiness and the vehicle before approving. Upload does not verify authenticity.</p><div className="scroll"><table><thead><tr><th>Name / UID</th><th>Vehicle</th><th>City / category</th><th>Approval</th><th>Documents</th><th>Review</th></tr></thead><tbody>{drivers.map(d=><tr key={d.id}><td>{d.name}<br/><small>{d.id}</small></td><td>{d.vehicle} · {d.plate}</td><td>{d.city} · {d.type}</td><td>{d.approved?'Approved':'Pending / revoked'}</td><td>{['licence','insurance','roadworthiness','identity'].map(kind => <div key={kind}>{d.documents?.[kind] ? <button onClick={() => viewDocument(d.documents[kind])}>View {kind}</button> : <span>{kind}: missing</span>}</div>)}</td><td><button disabled={busy || (!d.approved && !['licence','insurance','roadworthiness','identity'].every(k=>d.documents?.[k]))} onClick={()=>{if(window.confirm(d.approved?'Revoke approval and set offline?':'I have verified this driver and vehicle. Approve?'))act('approveDriver',{driverId:d.id,approved:!d.approved});}}>{d.approved?'Revoke':'Approve verified driver'}</button></td></tr>)}</tbody></table></div></section>
    <section><h2>Fare configuration</h2><p>Enter monetary values in pesewas (GH₵ 1 = 100 pesewas). Existing rides keep their recorded fares and commission.</p><form onSubmit={e=>{e.preventDefault();act('setFareSettings',settings);}}>{Object.keys(settings).map(k=><label key={k}>{k}<input type="number" required min={0} step={1} value={settings[k]} onChange={e=>setSettings({...settings,[k]:Number(e.target.value)})}/></label>)}<button disabled={busy}>Save fares</button></form></section>
    <section><h2>Payment status</h2><p>Cash is marked collected only when the assigned driver confirms receipt. MoMo is marked paid only after Paystack verification. Driver payouts, refunds and reconciliation require operator action; earnings are not a payout confirmation.</p></section></main>;
}
