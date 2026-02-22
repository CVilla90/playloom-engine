interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg?url" {
  const content: string;
  export default content;
}

declare module "*.wav?url" {
  const content: string;
  export default content;
}
