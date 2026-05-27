import { Sale, PaymentMethod } from "../types";
import { format } from "date-fns";

export const generateReceiptBuffer = (
  sale: Sale,
  options: any,
  customerDebt: any
): Uint8Array => {
  console.log("Generating ESC/POS receipt buffer for sale:", sale.id);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const addText = (text: string) => chunks.push(encoder.encode(text + "\n"));
  const addCommand = (cmd: number[]) => chunks.push(new Uint8Array(cmd));

  // Initialize printer
  addCommand([0x1b, 0x40]);
  // Center alignment
  addCommand([0x1b, 0x61, 0x01]);

  addText("Ganewa Shopping Mall Kurfi");
  addText("Tashan Ladan, Mamman Na'antu");
  addText("Street, Kurfi");
  addText("GSM: 08031328041, 09121886883");
  addText("ganewashoppingmallkurfi@gmail.com");
  addText("--------------------------------");

  // Left alignment
  addCommand([0x1b, 0x61, 0x00]);
  addText(`Date: ${format(new Date(sale.date), "dd/MM/yyyy HH:mm")}`);
  addText(`Sale ID: #${sale.id}`);
  addText(`Customer: ${sale.customerName || "Walk-in"}`);
  addText("--------------------------------");

  sale.items.forEach((item, index) => {
    addText(`${index + 1}. ${item.productName.substring(0, 29)}`);
    addText(
      `${item.quantity} x ${item.price.toFixed(2)} = ${item.total.toFixed(2)}`
    );
  });

  addText("--------------------------------");
  addText(`TOTAL: N${sale.finalAmount.toFixed(2)}`);
  addText(`Method: ${sale.paymentMethod}`);

  const debt = sale.debtInfo || customerDebt;
  if (debt) {
    addText("--------------------------------");
    addCommand([0x1b, 0x61, 0x01]); // Center
    addText(debt.thisSaleDebt > 0 ? "CREDIT SALE - DEBT ACCOUNT" : "DEBT ACCOUNT STATUS");
    addCommand([0x1b, 0x61, 0x00]); // Left
    addText(`Previous Balance: N${debt.previousDebt.toFixed(2)}`);
    
    const saleDebt = debt.thisSaleDebt !== undefined ? debt.thisSaleDebt : (debt.newDebt - debt.previousDebt);
    addText(`This Sale: ${saleDebt > 0 ? "+" : ""}N${saleDebt.toFixed(2)}`);
    
    addText(`New Balance: N${debt.newDebt.toFixed(2)}`);
    addText(`Credit Limit: N${(debt.creditLimit || 0).toFixed(2)}`);
    
    if (debt.newDebt > (debt.creditLimit || 0) && (debt.creditLimit || 0) > 0) {
      addText("!!! CREDIT LIMIT EXCEEDED !!!");
    }
  }

  addText("--------------------------------");
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

export const printRawReceipt = async (buffer: Uint8Array): Promise<void> => {
  console.log("Printing raw receipt via Tauri (Proxy)", buffer);
  // This would typically involve a Tauri command to a backend printing service
};
