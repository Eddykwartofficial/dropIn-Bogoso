import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import 'places.dart';
import 'phone_login.dart';
import 'notifications.dart';
import 'driver_documents.dart';
import 'firebase_options.dart';

const driverApp = true;
final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
Future<dynamic> call(String name, Map<String, dynamic> data) async =>
    (await functions.httpsCallable(name).call(data)).data;
String ghanaMoney(dynamic n) => 'GH₵ ${((n as num? ?? 0) / 100).toStringAsFixed(2)}';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  String? setupError;
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    const emulator = bool.fromEnvironment('USE_EMULATORS');
    const host = String.fromEnvironment('EMULATOR_HOST', defaultValue: '10.0.2.2');
    if (emulator) {
      await FirebaseAuth.instance.useAuthEmulator(host, 9099);
      FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
      functions.useFunctionsEmulator(host, 5001);
    } else {
      await FirebaseAppCheck.instance.activate(
        androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
        appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
      );
    }
    if (!emulator) startNotifications();
  } catch (e) {
    setupError = 'Firebase setup is required. Follow FIREBASE-SETUP-GUIDE.md.\n$e';
  }
  runApp(DropInApp(setupError: setupError));
}

class DropInApp extends StatelessWidget {
  final String? setupError;
  const DropInApp({super.key, this.setupError});
  @override Widget build(BuildContext context) => MaterialApp(
    scaffoldMessengerKey: notificationMessenger,
    title: driverApp ? 'DropIn Driver' : 'DropIn Passenger',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff244c36)), useMaterial3: true),
    home: setupError != null
      ? Scaffold(body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(setupError!))))
      : StreamBuilder<User?>(
          stream: FirebaseAuth.instance.authStateChanges(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) return const Scaffold(body: Center(child: CircularProgressIndicator()));
            return snapshot.data == null ? const LoginPage() : driverApp ? const DriverPage() : const PassengerPage();
          },
        ),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController(), password = TextEditingController();
  bool create = false, busy = false;
  String error = '';
  @override void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  Future<void> submit() async {
    setState(() { busy = true; error = ''; });
    try {
      if (create) {
        await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email.text.trim(), password: password.text);
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.text.trim(), password: password.text);
      }
    } on FirebaseAuthException catch (e) { if (mounted) setState(() => error = e.message ?? e.code); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(driverApp ? 'DropIn • Driver' : 'DropIn • Passenger')),
    body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
      FilledButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PhoneLoginPage())), icon: const Icon(Icons.phone), label: const Text('Sign in with phone / SMS')),
      const SizedBox(height: 20),
      const Icon(Icons.local_taxi, size: 60),
      const SizedBox(height: 24),
      Text(create ? 'Create your account' : 'Welcome back', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 18),
      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
      TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password (at least 6 characters)')),
      if (error.isNotEmpty) Text(error, style: const TextStyle(color: Colors.red)),
      const SizedBox(height: 24),
      FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Please wait…' : create ? 'Create account' : 'Sign in')),
      TextButton(onPressed: busy ? null : () => setState(() => create = !create), child: Text(create ? 'Already registered? Sign in' : 'New here? Create an account')),
      TextButton(onPressed: busy ? null : () async {
        try { await FirebaseAuth.instance.sendPasswordResetEmail(email: email.text.trim()); if (mounted) setState(() => error = 'Password reset requested. Check your email.'); }
        catch (e) { if (mounted) setState(() => error = e.toString()); }
      }, child: const Text('Reset password')),
      const Text('Accounts connect to your operator’s Firebase project. Cash and operator-enabled MoMo rides.', style: TextStyle(fontSize: 12)),
    ]))),
  );
}

class PassengerPage extends StatefulWidget {
  const PassengerPage({super.key});
  @override State<PassengerPage> createState() => _PassengerPageState();
}
class _PassengerPageState extends State<PassengerPage> {
  String payment = 'cash';
  bool momoEnabled = false;
  @override void initState() { super.initState(); loadCapabilities(); }
  Future<void> loadCapabilities() async {
    try { final c = await call('getOperatorCapabilities', {}); if (mounted) setState(() => momoEnabled = c['momoEnabled'] == true); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
  }
  Future<void> payRide(String rideId) async {
    final receiptEmail = TextEditingController(text: FirebaseAuth.instance.currentUser?.email ?? '');
    final email = await showDialog<String>(context: context, builder: (c) => AlertDialog(
      title: const Text('MoMo receipt email'), content: TextField(controller: receiptEmail, keyboardType: TextInputType.emailAddress),
      actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, receiptEmail.text.trim()), child: const Text('Continue'))],
    ));
    receiptEmail.dispose();
    if (email == null || !mounted) return;
    setState(() { busy = true; error = ''; });
    try {
      final result = await call('initializePayment', {'rideId': rideId, 'email': email});
      if (result['status'] != 'paid' && !await launchUrl(Uri.parse(result['url'] as String), mode: LaunchMode.externalApplication)) throw Exception('Could not open payment checkout');
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  String city = 'Accra', pickup = 'accra-mall', dropoff = 'osu', type = 'standard', error = '';
  bool busy = false;
  Map<String, dynamic>? quote;
  String? requestId;
  Future<void> act(String name, Map<String, dynamic> data) async {
    setState(() { busy = true; error = ''; });
    try { await call(name, data); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  void routeChanged() { quote = null; requestId = null; }
  @override Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final cityPlaces = places.where((p) => p['city'] == city).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('DropIn • Your next ride'), actions: [IconButton(onPressed: () => safeSignOut(), icon: const Icon(Icons.logout), tooltip: 'Sign out')]),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Text('Where are we heading?', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 18),
        DropdownButtonFormField<String>(value: city, decoration: const InputDecoration(labelText: 'City'), items: ['Accra','Kumasi','Tamale','Tarkwa'].map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(), onChanged: busy ? null : (v)=>setState(() { city=v!; final p=places.where((p)=>p['city']==city).toList(); pickup=p[0]['id'] as String; dropoff=p[1]['id'] as String; routeChanged(); })),
        DropdownButtonFormField<String>(value: pickup, decoration: const InputDecoration(labelText: 'Pickup'), items: cityPlaces.map((p)=>DropdownMenuItem(value:p['id'] as String,child:Text(p['name'] as String))).toList(), onChanged: busy ? null : (v)=>setState(() { pickup=v!; routeChanged(); })),
        DropdownButtonFormField<String>(value: dropoff, decoration: const InputDecoration(labelText: 'Destination'), items: cityPlaces.map((p)=>DropdownMenuItem(value:p['id'] as String,child:Text(p['name'] as String))).toList(), onChanged: busy ? null : (v)=>setState(() { dropoff=v!; routeChanged(); })),
        DropdownButtonFormField<String>(value: type, decoration: const InputDecoration(labelText: 'Vehicle'), items: const [DropdownMenuItem(value:'standard',child:Text('DropIn Go · 4 seats')),DropdownMenuItem(value:'comfort',child:Text('DropIn Comfort · 4 seats')),DropdownMenuItem(value:'xl',child:Text('DropIn XL · 6 seats'))], onChanged: busy ? null : (v)=>setState(() { type=v!; routeChanged(); })),
        if (momoEnabled) DropdownButtonFormField<String>(value: payment, decoration: const InputDecoration(labelText: 'Payment'), items: const [DropdownMenuItem(value: 'cash', child: Text('Cash')), DropdownMenuItem(value: 'momo', child: Text('Mobile Money'))], onChanged: busy ? null : (v) => setState(() { payment = v!; routeChanged(); })),
        const SizedBox(height: 18),
        OutlinedButton(onPressed: busy || pickup==dropoff ? null : () async {
          setState(() { busy=true; error=''; });
          try { final q=await call('getQuote',{'pickup':pickup,'dropoff':dropoff,'type':type}); if (mounted) setState(()=>quote=Map<String,dynamic>.from(q)); }
          catch (e) { if (mounted) setState(()=>error=e.toString()); }
          finally { if (mounted) setState(()=>busy=false); }
        }, child: const Text('Get road-route estimate')),
        if (quote != null) Text('${ghanaMoney(quote!['farePesewas'])} • ${(quote!['km'] as num).toStringAsFixed(1)} km • ${quote!['minutes']} min'),
        FilledButton(onPressed: busy || quote==null ? null : () async {
          requestId ??= 'ride_${DateTime.now().microsecondsSinceEpoch}';
          await act('requestRide',{'pickup':pickup,'dropoff':dropoff,'type':type,'payment':payment,'requestId':requestId});
          if (error.isEmpty && mounted) setState(() { quote=null; requestId=null; });
        }, child: Text(busy ? 'Please wait…' : 'Request ride · ${payment == 'cash' ? 'Cash' : 'MoMo'}')),
        const Text('Cash is paid to the driver. MoMo, when enabled, is paid through checkout after the trip. Final fare is calculated at booking.',style:TextStyle(fontSize:12)),
        if (error.isNotEmpty) Text(error,style:const TextStyle(color:Colors.red)),
        const Divider(height:40),
        Text('Your rides',style:Theme.of(context).textTheme.titleLarge),
        StreamBuilder<QuerySnapshot<Map<String,dynamic>>>(
          stream:FirebaseFirestore.instance.collection('rides').where('passengerId',isEqualTo:uid).limit(30).snapshots(),
          builder:(context,snapshot) {
            if (snapshot.hasError) return Text('Could not load rides: ${snapshot.error}');
            if (!snapshot.hasData) return const LinearProgressIndicator();
            final docs=snapshot.data!.docs.toList()..sort((a,b)=>(b.data()['createdAt'] as Timestamp).compareTo(a.data()['createdAt'] as Timestamp));
            if (docs.isEmpty) return const Padding(padding:EdgeInsets.all(20),child:Text('Your first journey starts here.'));
            return Column(children:docs.map((doc) {
              final r=doc.data(),status=r['status'];
              return Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text('${r['pickup']['name']} → ${r['dropoff']['name']}',style:const TextStyle(fontWeight:FontWeight.bold)),
                Text('$status • ${ghanaMoney(r['farePesewas'])}'),
                Text(r['driverName'] == null ? 'Finding an available driver' : '${r['driverName']} • ${r['vehicle']} • ${r['plate']}'),
                SelectableText('Ride ID: ${doc.id}',style:const TextStyle(fontSize:11)),
                if (status=='searching') TextButton(onPressed:busy?null:()=>act('findNearestDriver',{'rideId':doc.id}),child:const Text('Find driver again')),
                if (['searching','offered','accepted','arrived'].contains(status)) TextButton(onPressed:busy?null:() async {
                  final yes=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:const Text('Cancel ride?'),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('Keep ride')),TextButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Cancel ride'))]));
                  if (yes==true) await act('updateRideStatus',{'rideId':doc.id,'status':'cancelled'});
                },child:const Text('Cancel ride')),
                if (status=='completed') Text('Payment: ${r['paymentStatus'] ?? 'pending'}'),
                if (status=='completed' && r['payment']=='momo' && r['paymentStatus']!='paid') FilledButton(onPressed: busy ? null : () => payRide(doc.id), child: const Text('Pay with MoMo')),
                if (r['paymentReference'] != null && r['paymentStatus'] != 'paid') TextButton(onPressed: busy ? null : () => act('verifyPayment', {'reference':r['paymentReference']}), child: const Text('Check payment status')),
                if (status=='completed' && r['rating']==null) Wrap(children:List.generate(5,(i)=>IconButton(tooltip:'Rate ${i+1} stars',onPressed:busy?null:()=>act('rateRide',{'rideId':doc.id,'rating':i+1}),icon:const Icon(Icons.star_border)))),
              ])));
            }).toList());
          },
        ),
      ]),
    );
  }
}

class DriverPage extends StatefulWidget {
  const DriverPage({super.key});
  @override State<DriverPage> createState() => _DriverPageState();
}
class _DriverPageState extends State<DriverPage> {
  final name=TextEditingController(), vehicle=TextEditingController(), plate=TextEditingController();
  String city='Accra',type='standard',error='';
  bool busy=false;
  Timer? timer;
  StreamSubscription<Position>? positions;
  StreamSubscription<DocumentSnapshot<Map<String,dynamic>>>? profile;
  bool startingTracking = false;
  Future<void> syncTracking(bool enabled) async {
    if (!enabled) { await positions?.cancel(); positions = null; return; }
    if (positions != null || startingTracking) return;
    startingTracking = true;
    try {
      LocationSettings settings;
      if (defaultTargetPlatform == TargetPlatform.android) {
        settings = AndroidSettings(accuracy: LocationAccuracy.high, distanceFilter: 0,
          intervalDuration: const Duration(seconds: 30),
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'DropIn Driver is online', notificationText: 'Location is shared for ride matching. Go offline in DropIn to stop.', enableWakeLock: true));
      } else {
        settings = AppleSettings(accuracy: LocationAccuracy.high, distanceFilter: 0,
          activityType: ActivityType.automotiveNavigation, pauseLocationUpdatesAutomatically: false,
          showBackgroundLocationIndicator: true, allowBackgroundLocationUpdates: true);
      }
      if (!mounted || !online) return;
      positions = Geolocator.getPositionStream(locationSettings: settings).listen((p) async {
        try { await call('updateDriverLocation', {'lat':p.latitude,'lng':p.longitude}); }
        catch (e) { if (mounted) setState(() => error = 'Location sync failed: $e'); }
      }, onError: (Object e) { if (mounted) setState(() => error = 'Location tracking stopped: $e'); });
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { startingTracking = false; }
  }
  bool online=false;
  @override void initState() { super.initState();
    profile = FirebaseFirestore.instance.doc('drivers/${FirebaseAuth.instance.currentUser!.uid}').snapshots().listen((s) {
      online = s.data()?['online'] == true && s.data()?['approved'] == true;
      syncTracking(online);
    }, onError: (Object e) { if (mounted) setState(() => error = e.toString()); });
    timer=Timer.periodic(const Duration(seconds:45),(_) { if (online && !busy) sendLocation().catchError((e) { if (mounted) setState(()=>error='Location update failed: $e'); }); }); }
  @override void dispose() { timer?.cancel(); positions?.cancel(); profile?.cancel(); name.dispose();vehicle.dispose();plate.dispose();super.dispose(); }
  Future<void> sendLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) throw Exception('Enable device location services');
    var permission=await Geolocator.checkPermission();
    if (permission==LocationPermission.denied) permission=await Geolocator.requestPermission();
    if (permission==LocationPermission.denied || permission==LocationPermission.deniedForever) throw Exception('Location permission is required to go online. Enable it in device settings.');
    if (permission != LocationPermission.always) throw Exception('Allow location All the time / Always in device settings before going online.');
    final p=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.high));
    await call('updateDriverLocation',{'lat':p.latitude,'lng':p.longitude});
  }
  Future<void> act(String action,Map<String,dynamic> data) async {
    setState(() { busy=true;error=''; });
    try { await call(action,data); }
    catch(e) { if (mounted) setState(()=>error=e.toString()); }
    finally { if (mounted) setState(()=>busy=false); }
  }
  @override Widget build(BuildContext context) {
    final uid=FirebaseAuth.instance.currentUser!.uid;
    return Scaffold(
      appBar:AppBar(title:const Text('DropIn • Driver'),actions:[IconButton(tooltip:'Sign out',onPressed:() async { if (online) { await act('setAvailability',{'online':false}); if (error.isNotEmpty) return; } await safeSignOut(); },icon:const Icon(Icons.logout))]),
      body:ListView(padding:const EdgeInsets.all(20),children:[
        if (error.isNotEmpty) Text(error,style:const TextStyle(color:Colors.red)),
        StreamBuilder<DocumentSnapshot<Map<String,dynamic>>>(
          stream:FirebaseFirestore.instance.doc('drivers/$uid').snapshots(),
          builder:(context,snapshot) {
            if (snapshot.hasError) return Text('Could not load driver profile: ${snapshot.error}');
            if (!snapshot.hasData) return const LinearProgressIndicator();
            final d=snapshot.data!.data();
            if (d==null) return Column(children:[
              Text('Apply to drive',style:Theme.of(context).textTheme.headlineMedium),
              TextField(controller:name,decoration:const InputDecoration(labelText:'Full name')),
              TextField(controller:vehicle,decoration:const InputDecoration(labelText:'Vehicle model')),
              TextField(controller:plate,decoration:const InputDecoration(labelText:'Registration plate')),
              DropdownButtonFormField<String>(value:city,items:['Accra','Kumasi','Tamale','Tarkwa'].map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(),onChanged:(v)=>setState(()=>city=v!)),
              DropdownButtonFormField<String>(value:type,items:['standard','comfort','xl'].map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(),onChanged:(v)=>setState(()=>type=v!)),
              FilledButton(onPressed:busy?null:()=>act('registerDriver',{'name':name.text,'vehicle':vehicle.text,'plate':plate.text,'city':city,'type':type}),child:const Text('Submit application')),
              const Text('An operator must verify your licence, insurance and vehicle before approving you.'),
            ]);
            online=d['online']==true;
            if (d['approved']!=true) return DriverDocuments(documents: Map<String,dynamic>.from(d['documents'] ?? {}));
            return Card(child:Padding(padding:const EdgeInsets.all(20),child:Column(children:[
              Text('${d['name']} • ${d['vehicle']}',style:Theme.of(context).textTheme.titleLarge),
              Text('${d['city']} • ${d['type']}'),
              TextButton(onPressed: () => Geolocator.openAppSettings(), child: const Text('Location permission settings')),
              const Text('Going online shares your location in the background to match nearby rides. Choose Always / All the time in settings. Go offline to stop.'),
              SwitchListTile(title:Text(online?'Online':'Offline'),subtitle:const Text('Background location while online'),value:online,onChanged:busy || d['activeRideId']!=null ? null : (v) async {
                setState(() { busy=true;error=''; });
                try { if (v) await sendLocation(); await call('setAvailability',{'online':v}); }
                catch(e) { if (mounted) setState(()=>error=e.toString()); }
                finally { if (mounted) setState(()=>busy=false); }
              }),
            ])));
          },
        ),
        const SizedBox(height:24),
        StreamBuilder<QuerySnapshot<Map<String,dynamic>>>(
          stream:FirebaseFirestore.instance.collection('rides').where('driverId',isEqualTo:uid).orderBy('createdAt',descending:true).limit(30).snapshots(),
          builder:(context,snapshot) {
            if (snapshot.hasError) return Text('Could not load trips: ${snapshot.error}');
            if (!snapshot.hasData) return const LinearProgressIndicator();
            final docs=snapshot.data!.docs.toList()..sort((a,b)=>(b.data()['createdAt'] as Timestamp).compareTo(a.data()['createdAt'] as Timestamp));
            return Column(children:docs.map((doc) {
              final r=doc.data(),status=r['status'],next={'offered':'accepted','accepted':'arrived','arrived':'in_progress','in_progress':'completed'}[status];
              return Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text('${r['pickup']['name']} → ${r['dropoff']['name']}',style:const TextStyle(fontWeight:FontWeight.bold)),
                Text('$status • ${ghanaMoney(r['farePesewas'])} • ${r['payment']}'),
                if (status=='completed') Text('Payment: ${r['paymentStatus'] ?? 'pending'}'),
                if (status=='completed' && r['payment']=='cash' && r['paymentStatus']!='cash_collected') TextButton(onPressed: busy ? null : () async {
                  final yes = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('Confirm cash received?'), content: const Text('Confirm only after you receive the full fare.'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not yet')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cash received'))]));
                  if (yes == true) await act('confirmCashCollected', {'rideId':doc.id});
                }, child: const Text('Confirm cash collected')),
                if (next!=null) FilledButton(onPressed:busy?null:()=>act('updateRideStatus',{'rideId':doc.id,'status':next}),child:Text({'accepted':'Accept ride','arrived':'Arrived at pickup','in_progress':'Start trip','completed':'Complete trip'}[next]!)),
                if (next!=null) TextButton(onPressed:() async {
                  final target=status=='in_progress'?r['dropoff']:r['pickup'];
                  final uri=Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${target['lat']},${target['lng']}&travelmode=driving');
                  if (!await launchUrl(uri,mode:LaunchMode.externalApplication) && mounted) setState(()=>error='Could not open navigation.');
                },child:const Text('Open navigation')),
                if (status=='offered') TextButton(onPressed:busy?null:()=>act('declineRide',{'rideId':doc.id}),child:const Text('Decline • find another driver')),
                if (['accepted','arrived'].contains(status)) TextButton(onPressed:busy?null:()=>act('updateRideStatus',{'rideId':doc.id,'status':'cancelled'}),child:const Text('Cancel ride')),
              ])));
            }).toList());
          },
        ),
        const Divider(height:32),
        Text('Earnings ledger',style:Theme.of(context).textTheme.titleLarge),
        StreamBuilder<QuerySnapshot<Map<String,dynamic>>>(
          stream:FirebaseFirestore.instance.collection('ledger').where('driverId',isEqualTo:uid).orderBy('createdAt',descending:true).limit(50).snapshots(),
          builder:(context,snapshot) {
            if (snapshot.hasError) return Text('Ledger error: ${snapshot.error}');
            if (!snapshot.hasData) return const LinearProgressIndicator();
            final total=snapshot.data!.docs.fold<num>(0,(sum,doc)=>sum+(doc.data()['driverNetPesewas'] as num));
            return Text('Net recorded earnings: ${ghanaMoney(total)}\nRecorded fares, including unpaid fares. Driver payouts are settled by the operator.');
          },
        ),
        const Text('Location is used while online, including in the background. Force-closing the app or battery restrictions may stop tracking; stale locations are excluded from dispatch. No automated emergency response is provided.',style:TextStyle(fontSize:12)),
      ]),
    );
  }
}
