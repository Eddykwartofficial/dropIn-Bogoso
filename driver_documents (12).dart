import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_functions/cloud_functions.dart';

class DriverDocuments extends StatefulWidget {
  final Map<String, dynamic> documents;
  const DriverDocuments({super.key, required this.documents});
  @override State<DriverDocuments> createState() => _DriverDocumentsState();
}
class _DriverDocumentsState extends State<DriverDocuments> {
  bool busy = false;
  String error = '';
  Future<void> upload(String kind) async {
    setState(() { busy = true; error = ''; });
    try {
      final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['jpg','jpeg','png','pdf'], withData: true);
      if (result == null) return;
      final file = result.files.single, bytes = result.files.single.bytes;
      if (bytes == null || bytes.isEmpty || bytes.length > 5*1024*1024) throw Exception('Choose a file under 5 MB.');
      final ext = file.extension?.toLowerCase();
      final mime = {'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','pdf':'application/pdf'}[ext];
      if (mime == null) throw Exception('Choose a JPEG, PNG or PDF.');
      final uid = FirebaseAuth.instance.currentUser!.uid;
      final path = 'driver-documents/$uid/$kind/${DateTime.now().microsecondsSinceEpoch}.$ext';
      await FirebaseStorage.instance.ref(path).putData(bytes, SettableMetadata(contentType: mime));
      await FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('attachDriverDocument').call({'kind':kind,'path':path});
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) => Column(children: [
    const Text('Upload your driving licence, insurance, roadworthiness certificate and identity document. An operator will review them before approval.'),
    for (final kind in ['licence','insurance','roadworthiness','identity']) ListTile(
      title: Text(kind), subtitle: Text(widget.documents[kind] == null ? 'Required • JPEG, PNG or PDF under 5 MB' : 'Uploaded • awaiting review'),
      trailing: TextButton(onPressed: busy ? null : () => upload(kind), child: Text(widget.documents[kind] == null ? 'Upload' : 'Replace')),
    ),
    if (busy) const LinearProgressIndicator(),
    if (error.isNotEmpty) Text(error, style: const TextStyle(color: Colors.red)),
  ]);
}
