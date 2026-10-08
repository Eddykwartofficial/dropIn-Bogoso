#!/usr/bin/env python3
"""Generate native Flutter platform scaffolds without replacing supplied Dart code."""
import pathlib, plistlib, shutil, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parents[1]
for folder, name in [('1-Passenger-App','dropin_passenger'),('2-Driver-App','dropin_driver')]:
    target = root / folder
    with tempfile.TemporaryDirectory(prefix='dropin-flutter-') as temp:
        output = pathlib.Path(temp) / name
        subprocess.run(['flutter','create','--platforms=android,ios','--project-name',name,'--org','gh.dropin','--no-pub',str(output)],check=True)
        for platform in ['android','ios']:
            dest = target / platform
            if not dest.exists():
                shutil.copytree(output / platform,dest)
        metadata = output / '.metadata'
        if metadata.exists() and not (target / '.metadata').exists():
            shutil.copy2(metadata,target / '.metadata')
    manifest = target / 'android/app/src/main/AndroidManifest.xml'
    content = manifest.read_text()
    permissions = ['android.permission.INTERNET','android.permission.POST_NOTIFICATIONS']
    if name == 'dropin_driver':
        permissions += ['android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_BACKGROUND_LOCATION','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_LOCATION']
    for permission in permissions:
        if permission not in content:
            content = content.replace('<application',f'<uses-permission android:name="{permission}"/>\n    <application',1)
    manifest.write_text(content)
    for build in [target/'android/app/build.gradle.kts',target/'android/app/build.gradle']:
        if build.exists():
            text = build.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 24').replace('minSdkVersion flutter.minSdkVersion','minSdkVersion 24')
            build.write_text(text)
    if name == 'dropin_driver':
        info = target / 'ios/Runner/Info.plist'
        with info.open('rb') as f:
            data = plistlib.load(f)
        data['NSLocationWhenInUseUsageDescription'] = 'DropIn uses your location to match nearby ride requests and support navigation while you are online.'
        data['NSLocationAlwaysAndWhenInUseUsageDescription'] = 'DropIn shares your location while online, including in the background, so passengers can be matched to available drivers.'
        data['UIBackgroundModes'] = sorted(set(data.get('UIBackgroundModes', []) + ['location','remote-notification']))
        with info.open('wb') as f:
            plistlib.dump(data,f)
    # Both apps receive remote ride-status notifications. APNs entitlement must be enabled in Xcode.
    info = target / 'ios/Runner/Info.plist'
    with info.open('rb') as f:
        data = plistlib.load(f)
    data['UIBackgroundModes'] = sorted(set(data.get('UIBackgroundModes', []) + ['remote-notification']))
    with info.open('wb') as f:
        plistlib.dump(data,f)
print('Native scaffolds ready. Run flutter pub get and flutterfire configure in each app directory.')
