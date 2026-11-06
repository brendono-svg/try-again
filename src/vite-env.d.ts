/// <reference types="vite/client" />
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
declare module 'pdfjs-dist/legacy/build/pdf.mjs';
