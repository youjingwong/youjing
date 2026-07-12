import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canDownloadCurrentImage,
  getCurrentImageLoadState,
} from './imageLoadState.ts';

const firstFile = { name: 'first.jpg' };
const replacementFile = { name: 'replacement.jpg' };
const decodedImage = { width: 1200, height: 800 };
const loadedFirstFile = {
  file: firstFile,
  image: decodedImage,
  hasError: false,
};

test('only exposes a decoded image for the current file', () => {
  assert.equal(
    getCurrentImageLoadState(firstFile, loadedFirstFile)?.image,
    decodedImage
  );
  assert.equal(getCurrentImageLoadState(replacementFile, loadedFirstFile), null);
  assert.equal(getCurrentImageLoadState(null, loadedFirstFile), null);
});

test('download gating rejects stale, cleared, loading, and failed images', () => {
  assert.equal(canDownloadCurrentImage(firstFile, loadedFirstFile), true);
  assert.equal(canDownloadCurrentImage(replacementFile, loadedFirstFile), false);
  assert.equal(canDownloadCurrentImage(null, loadedFirstFile), false);
  assert.equal(
    canDownloadCurrentImage(firstFile, {
      file: firstFile,
      image: null,
      hasError: false,
    }),
    false
  );
  assert.equal(
    canDownloadCurrentImage(firstFile, {
      file: firstFile,
      image: null,
      hasError: true,
    }),
    false
  );
});
