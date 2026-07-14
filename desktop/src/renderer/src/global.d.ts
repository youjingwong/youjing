import type { PalangApi } from "../../preload";

declare global {
  interface Window {
    palang: PalangApi;
  }
}
export {};
