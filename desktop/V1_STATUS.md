# Palang IC Desktop V1 status

## Acceptance criteria

All 37 product acceptance workflows are implemented in the application:

1. macOS Apple Silicon/Intel and Windows x64 installer configurations and unsigned artifacts.
2. No account, activation, trial, subscription, analytics, OCR, or cloud dependency.
3. Fully offline profile creation, editing, locking, export, backup, and restore.
4. Multiple profiles containing one front image and an optional back image.
5. Crop, orientation correction, 90-degree rotation, horizontal flip, reset, quality checks, drag/drop, picker, and clipboard import.
6. Initials-only profile cards, search, name/modified/custom sorting, manual ordering, rename, duplicate, and confirmed deletion.
7. Independent front/back watermarking with multiline Unicode text, optional date, capitalization, alignment, line spacing, colour, opacity, rotation, normalized position, and keyboard movement. Recipient and purpose fields were intentionally removed in favour of one direct, editable watermark item.
8. Independently configurable crossing lines with colour, opacity, thickness, width, rotation, position, enable/disable, and recommended reset.
9. Global preset create/apply/update/delete and recommended-default restore.
10. Front, back, separate images, stacked image, stacked A4 PDF, and clipboard output with quality levels, sanitized filenames, destination selection, default folder, open, and reveal actions.
11. AES-256-GCM image encryption, random nonces, OS-protected random master key, scrypt password wrapping, manual/minimize/inactivity locking, password change/disable, and forgotten-password destructive reset.
12. Separately passworded authenticated backups, complete preflight decryption, profile preview/selection, keep/replace/copy conflicts, staged restore, schema checks, and atomic metadata replacement.
13. Side-specific corruption handling and image replacement without silently deleting metadata.
14. Versioned vault schema with a tested v1-to-v2 migration and pre-migration metadata snapshot.
15. Confirmed password-protected local-data deletion while leaving prior external exports untouched.
16. English and Bahasa Malaysia component translations.
17. Sandboxed/context-isolated renderer, no Node integration, narrow validated IPC, blocked navigation/new windows, allowlisted external URLs, restrictive production CSP, and no renderer network connections.

## Automated verification

- Unit suites cover encryption round trips, fresh nonces, authentication failures, password derivation, encrypted backup serialization/password failures/version rejection, filename sanitization, Unicode initials, IPC settings/preset bounds, normalized watermark positions, legacy-template cleanup, and migrations.
- The Electron integration test launches with a fresh isolated user-data directory, confirms the offline home screen, verifies renderer Node access is absent, and opens Settings.
- TypeScript and production Electron builds run as required parts of the verification scripts.

## External release gates

These cannot be completed from source code alone:

- Sign both macOS architectures with a Developer ID Application certificate and notarize/staple the DMGs using an Apple Developer account.
- Sign the Windows executable and NSIS installer with the production organisation's trusted code-signing certificate.
- Execute the platform test checklist on Apple Silicon macOS, Intel macOS, Windows 10 x64, and Windows 11 x64, including HEIC fixtures, install/update/reinstall retention, OS file dialogs, clipboard behaviour, Keychain/DPAPI access, assistive technology, and uninstaller behaviour.
- Replace the manual website-based update check only if a signed automatic-update channel is introduced later.
