import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import { extractPdfPages, type PdfPage } from './pdfText';

let workerReady = false;

/** Read a PDF entirely in the browser – the file never leaves this device. */
export async function loadPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    workerReady = true;
  }
  return extractPdfPages(pdfjs, data);
}
