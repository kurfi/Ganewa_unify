import { jsPDF } from 'jspdf';
import { Product } from '../types';
import { encodeCode128B } from './printerService';

export type A4GridLayout = '40' | '24'; // 40-up (4x10) or 24-up (3x8)

export interface A4BarcodeOptions {
  layout?: A4GridLayout;
  showCutLines?: boolean;
}

interface LayoutConfig {
  layout: A4GridLayout;
  columns: number;
  rows: number;
  labelsPerPage: number;
  marginLeft: number;
  marginTop: number;
  gapX: number;
  gapY: number;
  labelWidth: number;
  labelHeight: number;
  nameFontSize: number;
  codeFontSize: number;
  priceFontSize: number;
  barcodeHeight: number;
  maxBarcodeWidth: number;
}

const getLayoutConfig = (layout: A4GridLayout): LayoutConfig => {
  if (layout === '24') {
    // 24 labels per sheet: 3 columns x 8 rows (larger labels)
    return {
      layout: '24',
      columns: 3,
      rows: 8,
      labelsPerPage: 24,
      marginLeft: 8,
      marginTop: 9,
      gapX: 3,
      gapY: 3,
      labelWidth: 62.6,
      labelHeight: 32.1,
      nameFontSize: 8.5,
      codeFontSize: 7,
      priceFontSize: 9,
      barcodeHeight: 12.5,
      maxBarcodeWidth: 54,
    };
  }

  // Default: 40 labels per sheet (4 columns x 10 rows - standard Avery 40-up)
  return {
    layout: '40',
    columns: 4,
    rows: 10,
    labelsPerPage: 40,
    marginLeft: 7,
    marginTop: 8,
    gapX: 2.2,
    gapY: 2.5,
    labelWidth: 47.2,
    labelHeight: 25.6,
    nameFontSize: 7.5,
    codeFontSize: 6.5,
    priceFontSize: 8,
    barcodeHeight: 9.5,
    maxBarcodeWidth: 41,
  };
};

/**
 * Converts Code 128 binary modules (1=bar, 0=space) to a pure vector SVG string.
 */
export const generateBarcodeSvg = (modules: number[]): string => {
  const total = modules.length;
  const rects: string[] = [];
  let i = 0;
  while (i < total) {
    if (modules[i] === 1) {
      let run = 1;
      while (i + run < total && modules[i + run] === 1) {
        run++;
      }
      rects.push(`<rect x="${i}" y="0" width="${run}" height="100" fill="#000000" />`);
      i += run;
    } else {
      i++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${rects.join('')}</svg>`;
};

/**
 * Generates an A4 PDF containing barcode labels for the product and triggers an immediate download.
 */
export const generateA4BarcodePdf = async (
  product: Product,
  quantity: number,
  options?: A4BarcodeOptions
): Promise<void> => {
  const layout = options?.layout ?? '40';
  const showCutLines = options?.showCutLines ?? true;
  const cfg = getLayoutConfig(layout);

  const barcodeText = (
    (product.barcode && product.barcode.trim()) ||
    (product.id ? product.id.slice(0, 10).toUpperCase() : (product.name ? product.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() : '0000'))
  );
  const modules = encodeCode128B(barcodeText);
  const productName = (product.name || '').trim();
  const priceFormatted = Number(product.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const priceDisplay = `N${priceFormatted}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totalLabels = Math.max(1, quantity);
  const totalPages = Math.ceil(totalLabels / cfg.labelsPerPage);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage();
    }

    const startIdx = page * cfg.labelsPerPage;
    const endIdx = Math.min(totalLabels, startIdx + cfg.labelsPerPage);

    for (let idx = startIdx; idx < endIdx; idx++) {
      const posOnPage = idx - startIdx;
      const col = posOnPage % cfg.columns;
      const row = Math.floor(posOnPage / cfg.columns);

      const labelX = cfg.marginLeft + col * (cfg.labelWidth + cfg.gapX);
      const labelY = cfg.marginTop + row * (cfg.labelHeight + cfg.gapY);
      const centerX = labelX + cfg.labelWidth / 2;

      // Draw dashed cut border if enabled
      if (showCutLines) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.15);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.roundedRect(labelX, labelY, cfg.labelWidth, cfg.labelHeight, 1, 1, 'S');
        doc.setLineDashPattern([], 0); // Reset dash
      }

      // 1. Product Name (Top)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.nameFontSize);
      doc.setTextColor(0, 0, 0);

      const maxChars = cfg.columns === 3 ? 24 : 18;
      const displayName = productName.length > maxChars ? productName.substring(0, maxChars - 1) + '…' : productName;
      doc.text(displayName, centerX, labelY + (cfg.layout === '24' ? 4.5 : 3.8), { align: 'center' });

      // 2. Vector Barcode Bars
      const barcodeTotalModules = modules.length;
      const modWidthMm = Math.min(cfg.maxBarcodeWidth / barcodeTotalModules, 0.45);
      const barcodeActualWidth = barcodeTotalModules * modWidthMm;
      const barcodeStartX = centerX - barcodeActualWidth / 2;
      const barcodeY = labelY + (cfg.layout === '24' ? 6.5 : 5.2);

      doc.setFillColor(0, 0, 0);
      let curX = barcodeStartX;
      let m = 0;
      while (m < barcodeTotalModules) {
        if (modules[m] === 1) {
          let run = 1;
          while (m + run < barcodeTotalModules && modules[m + run] === 1) {
            run++;
          }
          doc.rect(curX, barcodeY, run * modWidthMm, cfg.barcodeHeight, 'F');
          curX += run * modWidthMm;
          m += run;
        } else {
          curX += modWidthMm;
          m++;
        }
      }

      // 3. Human-readable Barcode Text
      doc.setFont('courier', 'bold');
      doc.setFontSize(cfg.codeFontSize);
      doc.setTextColor(50, 50, 50);
      const textY = barcodeY + cfg.barcodeHeight + (cfg.layout === '24' ? 3.0 : 2.5);
      doc.text(barcodeText, centerX, textY, { align: 'center' });

      // 4. Price (Bottom)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.priceFontSize);
      doc.setTextColor(0, 0, 0);
      const priceY = textY + (cfg.layout === '24' ? 4.5 : 3.8);
      doc.text(`Price: ${priceDisplay}`, centerX, priceY, { align: 'center' });
    }
  }

  const safeFileName = `${product.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_A4_Labels.pdf`;
  doc.save(safeFileName);
};

/**
 * Opens the native Windows print dialogue with clean A4 barcode sheet formatting.
 */
export const printA4BarcodesWindowsDialog = async (
  product: Product,
  quantity: number,
  options?: A4BarcodeOptions
): Promise<boolean> => {
  const layout = options?.layout ?? '40';
  const showCutLines = options?.showCutLines ?? true;
  const cfg = getLayoutConfig(layout);

  const barcodeText = (
    (product.barcode && product.barcode.trim()) ||
    (product.id ? product.id.slice(0, 10).toUpperCase() : (product.name ? product.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() : '0000'))
  );
  const modules = encodeCode128B(barcodeText);
  const barcodeSvg = generateBarcodeSvg(modules);
  const productName = (product.name || '').trim();
  const priceFormatted = Number(product.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const totalLabels = Math.max(1, quantity);
  const totalPages = Math.ceil(totalLabels / cfg.labelsPerPage);

  // Generate HTML pages for print
  const pagesHtml: string[] = [];

  for (let page = 0; page < totalPages; page++) {
    const startIdx = page * cfg.labelsPerPage;
    const endIdx = Math.min(totalLabels, startIdx + cfg.labelsPerPage);
    const labelCards: string[] = [];

    for (let idx = startIdx; idx < endIdx; idx++) {
      const maxChars = cfg.columns === 3 ? 24 : 18;
      const displayName = productName.length > maxChars ? productName.substring(0, maxChars - 1) + '…' : productName;

      labelCards.push(`
        <div class="label-card ${showCutLines ? 'with-border' : ''}">
          <div class="product-name">${escapeHtml(displayName)}</div>
          <div class="barcode-container">
            ${barcodeSvg}
          </div>
          <div class="barcode-text">${escapeHtml(barcodeText)}</div>
          <div class="product-price">Price: ₦${priceFormatted}</div>
        </div>
      `);
    }

    pagesHtml.push(`
      <div class="a4-page">
        <div class="label-grid cols-${cfg.columns}">
          ${labelCards.join('')}
        </div>
      </div>
    `);
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>A4 Barcodes - ${escapeHtml(product.name)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: ${cfg.marginTop}mm ${cfg.marginLeft}mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: Arial, sans-serif;
          background: #ffffff;
          color: #000000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .a4-page {
          width: 196mm;
          min-height: 281mm;
          page-break-after: always;
          break-after: page;
          display: flex;
          flex-direction: column;
        }
        .a4-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .label-grid {
          display: grid;
          gap: ${cfg.gapY}mm ${cfg.gapX}mm;
          width: 100%;
        }
        .label-grid.cols-4 {
          grid-template-columns: repeat(4, ${cfg.labelWidth}mm);
          grid-auto-rows: ${cfg.labelHeight}mm;
        }
        .label-grid.cols-3 {
          grid-template-columns: repeat(3, ${cfg.labelWidth}mm);
          grid-auto-rows: ${cfg.labelHeight}mm;
        }
        .label-card {
          width: ${cfg.labelWidth}mm;
          height: ${cfg.labelHeight}mm;
          padding: 1.5mm 1.5mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
          overflow: hidden;
          background: #ffffff;
        }
        .label-card.with-border {
          border: 1px dashed #cccccc;
          border-radius: 2px;
        }
        .product-name {
          font-size: ${cfg.nameFontSize}pt;
          font-weight: bold;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }
        .barcode-container {
          width: 90%;
          height: ${cfg.barcodeHeight}mm;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .barcode-text {
          font-family: 'Courier New', monospace;
          font-size: ${cfg.codeFontSize}pt;
          font-weight: bold;
          letter-spacing: 0.5px;
          color: #333333;
          line-height: 1;
        }
        .product-price {
          font-size: ${cfg.priceFontSize}pt;
          font-weight: 800;
          color: #000000;
          line-height: 1;
        }
      </style>
    </head>
    <body>
      ${pagesHtml.join('')}
    </body>
    </html>
  `;

  // Spawning isolated hidden iframe ensures the Windows print dialogue shows ONLY
  // the clean A4 page without background app DOM interference or receipt styles.
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return false;
    }

    doc.open();
    doc.write(fullHtml);
    doc.close();

    await new Promise((r) => setTimeout(r, 200));

    // Focus and open Windows print dialogue
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    // Clean up iframe after print dialog is handled
    setTimeout(() => {
      try {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      } catch {
        // Ignored
      }
    }, 2000);

    return true;
  } catch (err) {
    console.error('Error triggering Windows print dialog:', err);
    // Fallback: update body container and trigger window.print
    return false;
  }
};

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
