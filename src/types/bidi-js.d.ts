// bidi-js ships no typings. Only what this project calls is declared, against
// the shapes documented in its README.
declare module "bidi-js" {
  export type EmbeddingLevels = {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  };

  export type Bidi = {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number
    ): [number, number][];
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number
    ): Map<number, string>;
  };

  export default function bidiFactory(): Bidi;
}
