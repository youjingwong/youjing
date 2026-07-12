export interface ImageLoadState<TFile, TImage> {
  file: TFile;
  image: TImage | null;
  hasError: boolean;
}

export const getCurrentImageLoadState = <TFile, TImage>(
  file: TFile | null,
  loadState: ImageLoadState<TFile, TImage> | null
) => file && loadState?.file === file ? loadState : null;

export const canDownloadCurrentImage = <TFile, TImage>(
  file: TFile | null,
  loadState: ImageLoadState<TFile, TImage> | null
) => Boolean(getCurrentImageLoadState(file, loadState)?.image);
