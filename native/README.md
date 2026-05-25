# BARDEUR YK native wrappers

This project now includes lightweight starter files for Capacitor-style iOS and Android wrappers.

- PWA remains the main target.
- Android files are scaffolded only; no Android build was run.
- iOS permission strings are included for camera, microphone, gallery and notifications.
- Android cleartext traffic is disabled by default.

When native packaging is needed, install Capacitor in a separate pass and generate the platform projects from the existing `dist` output.
