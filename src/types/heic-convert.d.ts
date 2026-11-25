declare module "heic-convert" {
  type Options = {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: "JPEG" | "PNG";
    /** 0 to 1, JPEG only. */
    quality?: number;
  };
  export default function convert(options: Options): Promise<ArrayBuffer | Buffer>;
}
