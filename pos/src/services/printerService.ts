import { Sale, PaymentMethod, Product, Customer, SaleItem, ReturnReason } from "../types";
import { format } from "date-fns";
import { printViaDirectHardware } from "./webPrintService";
import type { LabelMediaType } from "./webPrintService";

// Helper functions for ESC/POS fixed-width monospace layouts
const padLeft = (text: string, len: number): string => {
  const str = String(text ?? "");
  if (str.length >= len) return str.slice(0, len);
  return " ".repeat(len - str.length) + str;
};

const padRight = (text: string, len: number): string => {
  const str = String(text ?? "");
  if (str.length >= len) return str.slice(0, len);
  return str + " ".repeat(len - str.length);
};

const formatKeyValue = (label: string, value: string, width: number): string => {
  const lbl = String(label ?? "");
  const val = String(value ?? "");
  const spaceNeeded = width - lbl.length - val.length;
  if (spaceNeeded >= 1) {
    return lbl + " ".repeat(spaceNeeded) + val;
  }
  // If too long to fit on one line, wrap the value to the next line right-aligned
  if (val.length <= width) {
    return lbl + "\n" + " ".repeat(Math.max(0, width - val.length)) + val;
  }
  // Long string (e.g. UUID) split across lines right-aligned
  const chunk1 = val.slice(0, Math.max(0, width - lbl.length - 1));
  const remainder = val.slice(chunk1.length);
  return lbl + " " + chunk1 + "\n" + " ".repeat(Math.max(0, width - remainder.length)) + remainder;
};

const wrapText = (text: string, maxLen: number): string[] => {
  if (!text) return [""];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      if (word.length <= maxLen) {
        currentLine = word;
      } else {
        for (let i = 0; i < word.length; i += maxLen) {
          lines.push(word.slice(i, i + maxLen));
        }
      }
    } else if ((currentLine + " " + word).length <= maxLen) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      if (word.length <= maxLen) {
        currentLine = word;
      } else {
        for (let i = 0; i < word.length; i += maxLen) {
          lines.push(word.slice(i, i + maxLen));
        }
        currentLine = "";
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [""];
};

export interface ReturnReceiptData {
  originalSale: Sale;
  returnItems: (SaleItem & {
    returnedQuantity: number;
    restockStatus: "restocked" | "damaged";
    reason?: ReturnReason | string;
  })[];
  totalRefundAmount: number;
  returnReason: ReturnReason | string;
  refundMethod: PaymentMethod;
  customer?: Customer | null;
  cashierUsername: string;
  returnDate: Date | string;
  returnId: string | null;
}

export const generateReceiptBuffer = (
  sale: Sale,
  options?: { paperSize?: "80mm" | "58mm" } | any,
  customerDebt?: any
): Uint8Array => {
  console.log("Generating ESC/POS receipt buffer for sale:", sale.id);

  const paperSize = options?.paperSize || "80mm";
  const width = paperSize === "58mm" ? 32 : 48;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const addText = (text: string) => chunks.push(encoder.encode(text + "\n"));
  const addCommand = (cmd: number[]) => chunks.push(new Uint8Array(cmd));

  // Initialize printer
  addCommand([0x1b, 0x40]);

  // Center alignment
  addCommand([0x1b, 0x61, 0x01]);
  // Store Title (Bold)
  addCommand([0x1b, 0x45, 0x01]);
  addText("GANEWA SHOPPING MALL KURFI");
  addCommand([0x1b, 0x45, 0x00]);

  addText("Tashan Ladan, Mamman Na'antu Street, Kurfi");
  addText("Tel: 08031328041, 09121886883");
  addText("Email: ganewashoppingmallkurfi@gmail.com");
  addText("-".repeat(width));

  // Meta details (Left alignment, space-between)
  addCommand([0x1b, 0x61, 0x00]);
  const saleIdDisplay = `#${sale.invoiceNo || sale.id}`;
  addText(formatKeyValue("Sale ID:", saleIdDisplay, width));
  const saleDate = (sale.date as any)?.toDate?.() ?? new Date(sale.date);
  addText(formatKeyValue("Date:", format(saleDate, "dd/MM/yyyy HH:mm"), width));
  addText(formatKeyValue("Customer:", sale.customerName || "Walk-in", width));
  if (sale.cashier) {
    addText(formatKeyValue("Cashier:", sale.cashier, width));
  }
  addText("-".repeat(width));

  // Items Table
  if (width >= 48) {
    addText("S/N|Item                |Qty|  Price  |  Total  ");
    addText("---+--------------------+---+---------+---------");
  } else {
    addText("S/N|Item           |Qty|  Total ");
    addText("---+---------------+---+--------");
  }

  sale.items.forEach((item, index) => {
    const sn = String(index + 1);
    const qty = String(item.quantity);
    const priceStr = (item.price || 0).toFixed(2);
    const totalStr = (item.total || 0).toFixed(2);

    if (width >= 48) {
      const nameLines = wrapText((item.productName || "").toUpperCase(), 20);
      addText(
        `${padLeft(sn, 3)}|${padRight(nameLines[0], 20)}|${padLeft(qty, 3)}|${padLeft(priceStr, 9)}|${padLeft(totalStr, 9)}`
      );
      for (let k = 1; k < nameLines.length; k++) {
        addText(`   |${padRight(nameLines[k], 20)}|   |         |         `);
      }
    } else {
      const nameLines = wrapText((item.productName || "").toUpperCase(), 15);
      addText(
        `${padLeft(sn, 3)}|${padRight(nameLines[0], 15)}|${padLeft(qty, 3)}|${padLeft(totalStr, 8)}`
      );
      for (let k = 1; k < nameLines.length; k++) {
        addText(`   |${padRight(nameLines[k], 15)}|   |        `);
      }
    }
  });

  addText("-".repeat(width));

  // Totals Section
  if (sale.discount && sale.discount > 0) {
    addText(formatKeyValue("Subtotal:", `N${(sale.totalAmount || 0).toFixed(2)}`, width));
    addText(formatKeyValue("Discount:", `-N${sale.discount.toFixed(2)}`, width));
    addText("-".repeat(width));
  }

  // TOTAL line in bold
  addCommand([0x1b, 0x45, 0x01]);
  addText(formatKeyValue("TOTAL:", `N${(sale.finalAmount || 0).toFixed(2)}`, width));
  addCommand([0x1b, 0x45, 0x00]);

  if (sale.amountPaid !== undefined && sale.amountPaid > sale.finalAmount + 0.01) {
    addText(formatKeyValue("Cash Tendered:", `N${sale.amountPaid.toFixed(2)}`, width));
    const cDue = sale.changeDue !== undefined ? sale.changeDue : (sale.amountPaid - sale.finalAmount);
    addText(formatKeyValue("Change Due:", `N${cDue.toFixed(2)}`, width));
  }

  let paymentMethodDisplay: string = sale.paymentMethod || "CASH";
  if (sale.paymentMethod === PaymentMethod.MULTIPAY && sale.paymentMethods) {
    paymentMethodDisplay = sale.paymentMethods.map((m: any) => m.method).join(" + ");
  }
  addText(formatKeyValue("Payment Method:", paymentMethodDisplay.toUpperCase(), width));

  const debt = sale.debtInfo || customerDebt;
  if (debt) {
    addText("-".repeat(width));
    addCommand([0x1b, 0x61, 0x01]); // Center
    addCommand([0x1b, 0x45, 0x01]); // Bold
    addText(debt.thisSaleDebt > 0 ? "CREDIT SALE - DEBT ACCOUNT" : "DEBT ACCOUNT STATUS");
    addCommand([0x1b, 0x45, 0x00]);
    addCommand([0x1b, 0x61, 0x00]); // Left

    addText(formatKeyValue("Previous Balance:", `N${(debt.previousDebt || 0).toFixed(2)}`, width));
    const saleDebt = debt.thisSaleDebt !== undefined ? debt.thisSaleDebt : ((debt.newDebt || 0) - (debt.previousDebt || 0));
    addText(formatKeyValue("This Sale:", `${saleDebt > 0 ? "+" : ""}N${(saleDebt || 0).toFixed(2)}`, width));
    addText(formatKeyValue("New Balance:", `N${(debt.newDebt || 0).toFixed(2)}`, width));
    addText(formatKeyValue("Credit Limit:", `N${(debt.creditLimit || 0).toFixed(2)}`, width));

    if (debt.newDebt > (debt.creditLimit || 0) && (debt.creditLimit || 0) > 0) {
      addCommand([0x1b, 0x61, 0x01]); // Center
      addCommand([0x1b, 0x45, 0x01]); // Bold
      addText("!!! CREDIT LIMIT EXCEEDED !!!");
      addCommand([0x1b, 0x45, 0x00]);
      addCommand([0x1b, 0x61, 0x00]); // Left
    }
  }

  addText("-".repeat(width));
  // Center alignment
  addCommand([0x1b, 0x61, 0x01]);
  addText("Mun gode da kasuwancin ku!");
  addText("\n\n\n"); // Feed paper

  // Cut paper
  addCommand([0x1d, 0x56, 0x00]);

  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
};

export const generateReturnReceiptBuffer = (
  data: ReturnReceiptData,
  options?: { paperSize?: "80mm" | "58mm" }
): Uint8Array => {
  const paperSize = options?.paperSize || "80mm";
  const width = paperSize === "58mm" ? 32 : 48;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const addText = (text: string) => chunks.push(encoder.encode(text + "\n"));
  const addCommand = (cmd: number[]) => chunks.push(new Uint8Array(cmd));

  // Initialize printer
  addCommand([0x1b, 0x40]);

  // Center alignment
  addCommand([0x1b, 0x61, 0x01]);
  addCommand([0x1b, 0x45, 0x01]);
  addText("GANEWA SHOPPING MALL KURFI");
  addCommand([0x1b, 0x45, 0x00]);
  addText("Tashan Ladan, Mamman Na'antu Street, Kurfi");
  addText("Tel: 08031328041, 09121886883");
  addText("Email: ganewashoppingmallkurfi@gmail.com");
  addText("-".repeat(width));

  // Return Meta
  addCommand([0x1b, 0x61, 0x00]);
  addText(formatKeyValue("Return ID:", `#${data.returnId || "N/A"}`, width));
  const rDate = (data.returnDate as any)?.toDate?.() ?? new Date(data.returnDate);
  addText(formatKeyValue("Date:", format(rDate, "dd/MM/yyyy HH:mm"), width));
  addText(formatKeyValue("Customer:", data.customer?.name || data.originalSale.customerName || "Walk-in", width));
  addText(formatKeyValue("Cashier:", data.cashierUsername || "SuperAdmin", width));
  addText("-".repeat(width));

  // Original Sale Details
  addCommand([0x1b, 0x61, 0x01]);
  addCommand([0x1b, 0x45, 0x01]);
  addText("ORIGINAL SALE DETAILS:");
  addCommand([0x1b, 0x45, 0x00]);
  addCommand([0x1b, 0x61, 0x00]);
  addText(formatKeyValue("Sale ID:", `#${data.originalSale.invoiceNo || data.originalSale.id}`, width));
  const origDate = (data.originalSale.date as any)?.toDate?.() ?? new Date(data.originalSale.date);
  addText(formatKeyValue("Date:", format(origDate, "dd/MM/yyyy HH:mm"), width));
  addText(formatKeyValue("Amount:", `N${(data.originalSale.finalAmount || 0).toFixed(2)}`, width));
  addText("-".repeat(width));

  // Returned Items Table
  addCommand([0x1b, 0x61, 0x01]);
  addCommand([0x1b, 0x45, 0x01]);
  addText("RETURNED ITEMS:");
  addCommand([0x1b, 0x45, 0x00]);
  addCommand([0x1b, 0x61, 0x00]);

  if (width >= 48) {
    addText("S/N|Item                |Qty|  Price  | Refund  ");
    addText("---+--------------------+---+---------+---------");
  } else {
    addText("S/N|Item           |Qty| Refund ");
    addText("---+---------------+---+--------");
  }

  const itemsToDisplay = data.returnItems.filter((i) => i.returnedQuantity > 0);
  itemsToDisplay.forEach((item, index) => {
    const sn = String(index + 1);
    const qty = String(item.returnedQuantity);
    const priceStr = (item.price || 0).toFixed(2);
    const refundStr = (item.returnedQuantity * (item.price || 0)).toFixed(2);

    if (width >= 48) {
      const nameLines = wrapText((item.productName || "").toUpperCase(), 20);
      nameLines.push(`(${item.restockStatus})`);
      addText(
        `${padLeft(sn, 3)}|${padRight(nameLines[0], 20)}|${padLeft(qty, 3)}|${padLeft(priceStr, 9)}|${padLeft(refundStr, 9)}`
      );
      for (let k = 1; k < nameLines.length; k++) {
        addText(`   |${padRight(nameLines[k], 20)}|   |         |         `);
      }
    } else {
      const nameLines = wrapText((item.productName || "").toUpperCase(), 15);
      nameLines.push(`(${item.restockStatus})`);
      addText(
        `${padLeft(sn, 3)}|${padRight(nameLines[0], 15)}|${padLeft(qty, 3)}|${padLeft(refundStr, 8)}`
      );
      for (let k = 1; k < nameLines.length; k++) {
        addText(`   |${padRight(nameLines[k], 15)}|   |        `);
      }
    }
  });

  addText("-".repeat(width));
  addText(formatKeyValue("Return Reason:", String(data.returnReason), width));
  addText(formatKeyValue("Refund Method:", String(data.refundMethod), width));
  addText("-".repeat(width));

  addCommand([0x1b, 0x45, 0x01]);
  addText(formatKeyValue("TOTAL REFUND", `N${(data.totalRefundAmount || 0).toFixed(2)}`, width));
  addCommand([0x1b, 0x45, 0x00]);

  addText("-".repeat(width));
  addCommand([0x1b, 0x61, 0x01]);
  addText("Mun gode da kasuwancin ku!");
  addText("\n\n\n");
  addCommand([0x1d, 0x56, 0x00]);

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
};

// ---------------------------------------------------------------------------
// Product barcode label printing (2-up side-by-side on Xprinter XP-80)
// ---------------------------------------------------------------------------

// Standard Code 128 character patterns (subset B)
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

/** Encodes an ASCII string into an array of binary modules (1=bar, 0=space) using Code 128 (Subset B) */
export const encodeCode128B = (text: string): number[] => {
  const clean = text.replace(/[^\x20-\x7E]/g, '') || '0';
  const codes = [104]; // Start B
  let checkSum = 104;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    codes.push(code);
    checkSum += code * (i + 1);
  }
  codes.push(checkSum % 103);
  codes.push(106); // Stop

  const modules: number[] = [];
  codes.forEach((c) => {
    const pat = CODE128_PATTERNS[c];
    if (!pat) return;
    for (let j = 0; j < pat.length; j++) {
      const width = parseInt(pat[j], 10);
      const isBar = (j % 2 === 0);
      for (let k = 0; k < width; k++) {
        modules.push(isBar ? 1 : 0);
      }
    }
  });
  return modules;
};

/**
 * Renders product labels onto an 80mm ESC/POS monochrome raster bit image (GS v 0).
 * 
 * Supports two layouts:
 * - '4-up' (Recommended for plain paper): 4 labels arranged in a 2x2 grid (2 top, 2 bottom)
 *          with subtle dashed cutting/folding guide lines, perfectly filling the receipt strip
 *          and eliminating wasted upper space!
 * - '2-up' (Recommended for adhesive roll): 2 labels side by side in a single row.
 *
 * Paper specs:
 *   - Total width: 576 dots (standard 80 mm thermal printhead, 72 bytes across)
 *   - Height: 320 dots for 4-up (~40 mm height), 196 dots for 2-up (~24.5 mm height)
 *   - Left column:  origin x = 12, width = 264 dots (center = 144)
 *   - Right column: origin x = 300, width = 264 dots (center = 432)
 */
export const renderLabelsRaster = (product: Product, layout: '2-up' | '4-up' = '4-up'): Uint8Array => {
  const TOTAL_WIDTH = 576;
  const is4Up = layout === '4-up';
  const TOTAL_HEIGHT = is4Up ? 320 : 196;
  const xBytes = TOTAL_WIDTH / 8; // 72 bytes

  const barcodeText = (
    (product.barcode && product.barcode.trim()) ||
    (product.id ? product.id.slice(0, 10).toUpperCase() : (product.name ? product.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() : '0000'))
  );

  const modules = encodeCode128B(barcodeText);
  const productName = (product.name || '').trim();
  const priceText = `Price: N${Number(product.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = TOTAL_WIDTH;
    canvas.height = TOTAL_HEIGHT;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Solid white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, TOTAL_WIDTH, TOTAL_HEIGHT);

      const stickerWidth = 264;
      const maxBarcodeWidth = stickerWidth - 20; // 244px
      const modWidth = Math.max(1, Math.min(2.5, Math.floor((maxBarcodeWidth / modules.length) * 10) / 10));
      const barcodeTotalWidth = modules.length * modWidth;

      const renderSticker = (originX: number, originY: number) => {
        const centerX = originX + stickerWidth / 2;
        const barcodeStartX = Math.round(centerX - barcodeTotalWidth / 2);
        const barcodeY = originY + (is4Up ? 22 : 28);
        const barcodeHeight = is4Up ? 50 : 70;

        // 1. Product Name (Top)
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = is4Up
          ? (productName.length > 14 ? 'bold 14px Arial, sans-serif' : 'bold 16px Arial, sans-serif')
          : (productName.length > 14 ? 'bold 17px Arial, sans-serif' : 'bold 20px Arial, sans-serif');
        const displayName = productName.length > 18 ? productName.substring(0, 17) + '…' : productName;
        ctx.fillText(displayName, centerX, originY + (is4Up ? 4 : 8));

        // 2. Barcode
        ctx.fillStyle = '#000000';
        for (let i = 0; i < modules.length; i++) {
          if (modules[i] === 1) {
            ctx.fillRect(Math.round(barcodeStartX + i * modWidth), barcodeY, Math.ceil(modWidth), barcodeHeight);
          }
        }

        // 3. Human-readable code under barcode
        ctx.font = is4Up ? 'bold 12px "Courier New", monospace' : 'bold 13px "Courier New", monospace';
        ctx.fillText(barcodeText, centerX, barcodeY + barcodeHeight + (is4Up ? 4 : 6));

        // 4. Price (Bottom)
        ctx.font = is4Up ? 'bold 19px Arial, sans-serif' : 'bold 22px Arial, sans-serif';
        ctx.fillText(priceText, centerX, barcodeY + barcodeHeight + (is4Up ? 20 : 26));
      };

      if (is4Up) {
        // Row 1 (Top row)
        renderSticker(12, 8);
        renderSticker(300, 8);

        // Dashed cutting guide lines (light gray for thermal contrast)
        ctx.save();
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        // Horizontal cut line
        ctx.beginPath();
        ctx.moveTo(12, 160);
        ctx.lineTo(564, 160);
        ctx.stroke();
        // Vertical cut line
        ctx.beginPath();
        ctx.moveTo(288, 8);
        ctx.lineTo(288, 312);
        ctx.stroke();
        ctx.restore();

        // Row 2 (Bottom row)
        renderSticker(12, 168);
        renderSticker(300, 168);
      } else {
        // 2-up single row
        renderSticker(12, 8);
        renderSticker(300, 8);
      }

      // Extract pixel data & pack into ESC/POS GS v 0 1-bit monochrome raster
      const imgData = ctx.getImageData(0, 0, TOTAL_WIDTH, TOTAL_HEIGHT);
      const data = imgData.data;

      // GS v 0 0 xL xH yL yH header (8 bytes) + raster data
      const header = [
        0x1d, 0x76, 0x30, 0x00,
        xBytes & 0xff, (xBytes >> 8) & 0xff,
        TOTAL_HEIGHT & 0xff, (TOTAL_HEIGHT >> 8) & 0xff
      ];

      const rasterBytes = new Uint8Array(header.length + xBytes * TOTAL_HEIGHT);
      rasterBytes.set(header, 0);

      let byteOffset = header.length;
      for (let y = 0; y < TOTAL_HEIGHT; y++) {
        for (let bx = 0; bx < xBytes; bx++) {
          let byteVal = 0;
          for (let b = 0; b < 8; b++) {
            const x = bx * 8 + b;
            const pixelIdx = (y * TOTAL_WIDTH + x) * 4;
            const r = data[pixelIdx];
            const g = data[pixelIdx + 1];
            const bColor = data[pixelIdx + 2];
            const a = data[pixelIdx + 3];
            // Black threshold
            if (a > 128 && (r * 0.299 + g * 0.587 + bColor * 0.114 < 128)) {
              byteVal |= (1 << (7 - b));
            }
          }
          rasterBytes[byteOffset++] = byteVal;
        }
      }

      return rasterBytes;
    }
  }

  // Fallback for headless environments without canvas DOM
  const header = [
    0x1d, 0x76, 0x30, 0x00,
    xBytes & 0xff, (xBytes >> 8) & 0xff,
    TOTAL_HEIGHT & 0xff, (TOTAL_HEIGHT >> 8) & 0xff
  ];
  return new Uint8Array(header.length + xBytes * TOTAL_HEIGHT);
};

/** Alias for backwards compatibility */
export const renderTwoLabelsRaster = (product: Product): Uint8Array => {
  return renderLabelsRaster(product, '2-up');
};

/**
 * Builds an ESC/POS byte buffer that prints `pieces` pieces of product labels.
 * Each piece contains either:
 * - 4 labels (2x2 grid) for '4-up' mode (fills upper and lower space of the cut strip)
 * - 2 labels (side-by-side) for '2-up' mode
 *
 * Media types:
 * - 'plain'    : Extra blank line feeds + cut after every piece (strip)
 * - 'adhesive' : Advances across die-cut gap; cuts only after the final piece in the batch
 */
export const generateLabelBuffer = (
  product: Product,
  pieces: number,
  labelMediaType: LabelMediaType,
  isFinalBatch: boolean = true,
  layout: '2-up' | '4-up' = '4-up'
): Uint8Array => {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  const addText = (text: string) => chunks.push(encoder.encode(text));
  const addCommand = (cmd: number[]) => chunks.push(new Uint8Array(cmd));

  // ESC/POS full-cut command
  const CUT = [0x1d, 0x56, 0x00];

  // Pre-render the raster bitmap for the selected layout
  const rasterData = renderLabelsRaster(product, layout);

  for (let piece = 1; piece <= pieces; piece++) {
    // 1. Initialize printer & center alignment
    addCommand([0x1b, 0x40]);        // ESC @ — init printer
    addCommand([0x1b, 0x61, 0x01]); // ESC a 1 — center align

    // 2. Output raster bitmap (prints all labels in the strip at once)
    chunks.push(rasterData);

    // 3. Spacing & cut cadence
    if (labelMediaType === "plain") {
      // Plain paper: feed blank lines so the strip is pushed cleanly past the cutter knife
      addText("\n\n\n\n");
      addCommand(CUT);
    } else {
      // Adhesive die-cut roll: feed slightly to position next sticker at tear bar;
      // cut ONLY after the last piece in the batch.
      addText("\n");
      if (piece === pieces && isFinalBatch) {
        addCommand(CUT);
      }
    }
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((c) => {
    result.set(c, offset);
    offset += c.length;
  });
  return result;
};

/**
 * Convenience wrapper: prints product labels in safe batches so the printer's
 * buffer never overflows, whether printing 10, 50, 78, 100, or 500 labels!
 *
 * @param product Product to print
 * @param totalCount Total labels (or strips if isPieces is true)
 * @param labelMediaType 'plain' | 'adhesive'
 * @param options Optional progress callback, layout ('4-up' | '2-up'), and count unit
 */
export const printProductLabel = async (
  product: Product,
  totalCount: number,
  labelMediaType: LabelMediaType,
  options?: {
    isPieces?: boolean;
    layout?: '2-up' | '4-up';
    onProgress?: (printed: number, total: number) => void;
  }
): Promise<boolean> => {
  const layout = options?.layout ?? (labelMediaType === 'plain' ? '4-up' : '2-up');
  const labelsPerPiece = layout === '4-up' ? 4 : 2;

  // If count is total labels, convert to number of pieces (strips)
  const isPieces = options?.isPieces ?? false;
  const pieces = isPieces ? Math.max(1, totalCount) : Math.max(1, Math.ceil(totalCount / labelsPerPiece));
  const totalLabels = isPieces ? pieces * labelsPerPiece : totalCount;

  // Process in chunks (up to 8 pieces for 4-up, 10 for 2-up) to avoid buffer overflow on USB/BT
  const BATCH_SIZE = layout === '4-up' ? 8 : 10;

  for (let i = 0; i < pieces; i += BATCH_SIZE) {
    const batchPieces = Math.min(BATCH_SIZE, pieces - i);
    const isFinalBatch = (i + batchPieces >= pieces);

    const buffer = generateLabelBuffer(product, batchPieces, labelMediaType, isFinalBatch, layout);
    const ok = await printDirectToThermalPrinter(buffer);
    if (!ok) {
      return false;
    }

    const currentPrintedLabels = Math.min(totalLabels, (i + batchPieces) * labelsPerPiece);
    options?.onProgress?.(currentPrintedLabels, totalLabels);

    if (!isFinalBatch) {
      // Small pause between batches so printer mechanism can digest and print without buffer lag
      await new Promise((res) => setTimeout(res, 350));
    }
  }

  return true;
};



export const getPrintBridgeUrl = (): string => {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('printerTarget') : null;
  if (custom && custom.trim()) {
    let url = custom.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.port) {
        parsed.port = '9123';
        url = parsed.toString();
      }
    } catch {
      if (!url.includes(':')) url = url + ':9123';
    }
    return url.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:9123';
};

export const printDirectToThermalPrinter = async (buffer: Uint8Array): Promise<boolean> => {
  // 1. Try Direct Web Hardware (WebUSB, Web Bluetooth, Web Serial) without dialog or external server.
  //    Only attempt the user's configured type — the bridge is the primary fallback if it fails.
  const { getSavedHardwareType } = await import("./webPrintService");
  const savedType = getSavedHardwareType();

  if (savedType !== 'none') {
    try {
      const webOk = await printViaDirectHardware(buffer);
      if (webOk) {
        return true;
      }
    } catch (webErr) {
      console.warn("Direct web hardware print failed, trying bridge:", webErr);
    }
  }


  // 3. Try Local / Network Print Bridge HTTP server (primary path for Chromebook + bridge setup)
  try {
    const bridgeUrl = getPrintBridgeUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${bridgeUrl}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const result = await response.json();
      if (result.success) return true;
    }
  } catch (err: any) {
    // AbortError means bridge timed out / not running — silent fallback, no scary log
    if (err?.name !== 'AbortError') {
      console.warn("Local print bridge not available, falling back:", err);
    }
  }

  // (No further auto-discovery — bridge is the primary fallback when direct hardware fails)

  return false;
};



export const printThermalReceipt = async (
  sale: Sale,
  customerDebt?: any,
  options?: { paperSize?: "80mm" | "58mm" }
): Promise<{ direct: boolean }> => {
  try {
    const buffer = generateReceiptBuffer(sale, options, customerDebt);
    const directOk = await printDirectToThermalPrinter(buffer);
    if (directOk) {
      return { direct: true };
    }
  } catch (err) {
    console.warn("Direct thermal print error:", err);
  }
  // Fallback to browser print dialog if local bridge is not running
  window.print();
  return { direct: false };
};

export const printThermalReturnReceipt = async (
  data: ReturnReceiptData,
  options?: { paperSize?: "80mm" | "58mm" }
): Promise<{ direct: boolean }> => {
  try {
    const buffer = generateReturnReceiptBuffer(data, options);
    const directOk = await printDirectToThermalPrinter(buffer);
    if (directOk) {
      return { direct: true };
    }
  } catch (err) {
    console.warn("Direct thermal print return receipt error:", err);
  }
  window.print();
  return { direct: false };
};

export const printRawReceipt = async (buffer: Uint8Array): Promise<void> => {
  await printDirectToThermalPrinter(buffer);
};


