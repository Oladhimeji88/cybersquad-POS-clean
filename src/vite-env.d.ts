/// <reference types="vite/client" />

// Allow importing PDF files (and other binary assets) as URLs
declare module "*.pdf" {
  const src: string;
  export default src;
}
