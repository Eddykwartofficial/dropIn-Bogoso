import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

class PhoneLoginPage extends StatefulWidget {
  const PhoneLoginPage({super.key});
  @override State<PhoneLoginPage> createState() => _PhoneLoginPageState();
}
class _PhoneLoginPageState extends State<PhoneLoginPage> {
  final phone = TextEditingController(), code = TextEditingController();
  String? verificationId;
  int? resendToken;
  String error = '';
  bool busy = false;
  @override void dispose() { phone.dispose(); code.dispose(); super.dispose(); }
  void fail(String message) { if (mounted) setState(() { error = message; busy = false; }); }
  Future<void> signIn(PhoneAuthCredential credential) async {
    try { await FirebaseAuth.instance.signInWithCredential(credential); if (mounted) Navigator.pop(context); if (mounted) Navigator.pop(context); }
    on FirebaseAuthException catch (e) { fail(e.message ?? e.code); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> send() async {
    var number = phone.text.replaceAll(RegExp(r'[\s-]'), '');
    if (RegExp(r'^0\d{9}$').hasMatch(number)) number = '+233${number.substring(1)}';
    if (!RegExp(r'^\+233\d{9}$').hasMatch(number)) { fail('Enter a Ghana number, for example 0241234567.'); return; }
    setState(() { busy = true; error = ''; });
    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: number,
        forceResendingToken: resendToken,
        verificationCompleted: signIn,
        verificationFailed: (e) => fail(e.message ?? e.code),
        codeSent: (id, token) { if (mounted) setState(() { verificationId = id; resendToken = token; busy = false; }); },
        codeAutoRetrievalTimeout: (id) { if (mounted) setState(() { verificationId = id; busy = false; }); },
      );
    } catch (e) { fail(e.toString()); }
  }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('DropIn • Phone sign-in')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      const Text('Sign in with your Ghana phone number', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
      TextField(controller: phone, enabled: !busy && verificationId == null, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone number')),
      const Text('By continuing, you agree to receive a verification SMS. Your number is sent to Google for authentication and abuse prevention.'),
      if (verificationId != null) TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: '6-digit SMS code')),
      if (error.isNotEmpty) Text(error, style: const TextStyle(color: Colors.red)),
      FilledButton(onPressed: busy ? null : () async {
        if (verificationId == null) { await send(); return; }
        if (!RegExp(r'^\d{6}$').hasMatch(code.text.trim())) { fail('Enter the 6-digit SMS code.'); return; }
        setState(() { busy = true; error = ''; });
        await signIn(PhoneAuthProvider.credential(verificationId: verificationId!, smsCode: code.text.trim()));
      }, child: Text(busy ? 'Please wait…' : verificationId == null ? 'Send SMS code' : 'Verify and sign in')),
      if (verificationId != null) TextButton(onPressed: busy ? null : send, child: const Text('Resend code')),
      if (verificationId != null) TextButton(onPressed: busy ? null : () => setState(() { verificationId = null; code.clear(); }), child: const Text('Change phone number')),
    ]),
  );
}
