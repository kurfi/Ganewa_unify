import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

/**
 * Generates a PDF from an HTML element and saves it.
 */
export const generateAndSavePdfFromHtml = async (element: HTMLElement | null, fileName: string) => {
    if (!element) return;
    try {
        const dataUrl = await toPng(element, { quality: 0.95, pixelRatio: 2 });
        const doc = new jsPDF('p', 'mm', 'a4');
        const imgProps = doc.getImageProperties(dataUrl);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
        doc.save(fileName);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};

/**
 * Saves an HTML element as an image (PNG).
 */
export const saveElementAsImage = async (element: HTMLElement | null, fileName: string) => {
    if (!element) return;
    try {
        const dataUrl = await toPng(element, { quality: 1.0, pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        console.error('Error saving image:', error);
        throw error;
    }
};

/**
 * Copies an HTML element as an image (PNG) to the clipboard.
 */
export const copyElementToClipboard = async (element: HTMLElement | null): Promise<boolean> => {
    if (!element) return false;
    try {
        const dataUrl = await toPng(element, { quality: 1.0, pixelRatio: 2 });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        if (typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        return false;
    }
};

/**
 * Converts an HTML element to a File object (PNG).
 */
export const getElementAsFile = async (element: HTMLElement | null, fileName: string): Promise<File | null> => {
    if (!element) return null;
    try {
        const dataUrl = await toPng(element, { quality: 1.0, pixelRatio: 2 });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        return new File([blob], fileName.endsWith('.png') ? fileName : `${fileName}.png`, { type: 'image/png' });
    } catch (error) {
        console.error('Error converting element to file:', error);
        throw error;
    }
};

/**
 * Generic helper to save a jsPDF instance.
 * In a more complex app, this might handle file system access or storage.
 * For now, it just triggers a download.
 */
export const savePdf = async (doc: jsPDF, fileName: string, folder?: string) => {
    try {
        // Folder parameter is ignored in web browser download
        // but kept for interface compatibility
        doc.save(fileName);
    } catch (error) {
        console.error('Error saving PDF:', error);
        throw error;
    }
};
