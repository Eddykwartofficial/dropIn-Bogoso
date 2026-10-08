import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'firebase_options.dart';

final notificationMessenger = GlobalKey<ScaffoldMessengerState>();
@pragma('vm:entry-point')
Future<void> backgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}
Future<void> registerToken(String token) async {
  if (FirebaseAuth.instance.currentUser == null) return;
  await FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('registerPushToken').call({'token': token});
}
void startNotifications() {
  FirebaseMessaging.onBackgroundMessage(backgroundMessage);
  FirebaseAuth.instance.authStateChanges().listen((user) async {
    if (user == null) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await registerToken(token);
    } catch (_) {
      notificationMessenger.currentState?.showSnackBar(const SnackBar(content: Text('Notifications could not be enabled. Keep the app open to see ride updates.')));
    }
  });
  FirebaseMessaging.instance.onTokenRefresh.listen((token) async { try { await registerToken(token); } catch (_) {} });
  FirebaseMessaging.onMessage.listen((message) {
    notificationMessenger.currentState?.showSnackBar(SnackBar(content: Text(message.notification?.body ?? 'Your ride has been updated.')));
  });
  // Opening a push resumes the authenticated home screen; its Firestore stream shows the latest rides.
  FirebaseMessaging.onMessageOpenedApp.listen((_) {});
}
Future<void> safeSignOut() async {
  // Revoke push identity before ending auth to avoid alerts for the previous user on shared phones.
  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) await FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('unregisterPushToken').call({'token': token});
  await FirebaseAuth.instance.signOut();
}
