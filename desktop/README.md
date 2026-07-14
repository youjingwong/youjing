# Palang IC Desktop

Offline-first Electron application for keeping identity-card images in an encrypted local vault and exporting purpose-marked copies.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

`npm run dist` creates unsigned installers for the current host platform in `release/` (separate Apple Silicon and Intel DMGs on macOS, or Windows x64 on Windows). Use `npm run dist:mac` or `npm run dist:win` to select a platform explicitly. Each target is built from a clean production-dependency stage so native Sharp/libvips packages match the installer architecture. Packaging stops if either the package names or native binary headers do not match the target. `npm run dist:verify` can re-check unpacked applications in `release/`.

Production macOS and Windows installers must be signed; macOS builds must also be notarized. `npm run dist:signed` uses the same target-aware dependency staging for the current host platform and leaves certificate discovery enabled.

## Security model

- Identity images are prepared and encrypted in the Electron main process using AES-256-GCM with a fresh nonce per item.
- Without application locking, the random vault key is protected using Electron `safeStorage` (Keychain on macOS and DPAPI on Windows).
- Enabling an application password replaces that wrapper with a scrypt-derived, authenticated key envelope. Password changes rewrap the vault key rather than re-encrypting every image.
- Backup payloads use a separate password, salt, scrypt-derived key, and AES-256-GCM envelope.
- The renderer is sandboxed with context isolation and no Node integration. The preload bridge exposes only named operations, and the CSP blocks network connections and remote content.
- No analytics, account, activation, OCR, cloud synchronization, export history, or image upload code is present.

Profile metadata remains local in the operating system's per-user application-data folder. Document thumbnails are never shown on the home screen. Decrypted image data exists only while an opened profile is active in renderer memory.

## V1 implementation

The application includes encrypted front/back profiles, search/manual ordering/sorting/duplication, picker/drag/drop/clipboard intake, crop/rotate/flip preparation, English and Bahasa Malaysia, normalized watermark and crossing-line controls, preset CRUD, PNG/JPEG/PDF/clipboard exports, application locking, encrypted selective backup/restore, corruption recovery, versioned migrations, forgotten-password reset, and strong destructive-data confirmations.

Unsigned Intel and Apple Silicon DMGs and a Windows x64 NSIS installer can be built locally. Commercial release still requires an Apple Developer ID Application certificate plus notarization credentials, a trusted Windows code-signing certificate, and final physical testing on the supported macOS/Windows matrix. HEIC decoding must be included in that platform QA because support depends on the packaged Sharp/libvips build.

See [V1_STATUS.md](V1_STATUS.md) for the acceptance and release-gate audit.
