# youjing.dev

Personal site and the Palang IC browser-based watermarking tool.

## Getting started

Install dependencies and run the development server:

```bash
yarn install --frozen-lockfile
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Palang IC privacy architecture

Palang IC is designed so selected images never need to reach the application server:

- The editor is client-only and runs on a statically generated page.
- Selected files are kept in temporary React state.
- HEIC conversion runs locally through the bundled `heic2any` library.
- Watermarking and image composition use the browser Canvas API.
- Downloads are generated directly in the browser as local data/blob URLs.
- The application has no image upload endpoint, database integration, or persistent browser storage.
- Image object URLs are revoked after decoding, and the UI provides a Clear images action.
- Google Analytics is omitted from the tool route, and its Content Security Policy blocks third-party connections.
- Custom watermark text links use a URL fragment (`#text=...`), which is not sent in HTTP requests.

Only files the user explicitly downloads are saved to their device. Clear images removes images from the editor and invalidates pending results; refreshing or closing the tab ends the browser working session.

## Verification

```bash
yarn lint
yarn typecheck
yarn audit
yarn build
```

## Google Analytics setup

Portfolio pages support Google Analytics 4. Analytics is deliberately not loaded on Palang IC pages.

1. Create a Google Analytics 4 property.
2. Get its Measurement ID.
3. Add it to `.env.local`:

   ```bash
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

Page URLs are reduced to their pathname before being sent to analytics, so query strings and fragments are excluded.
