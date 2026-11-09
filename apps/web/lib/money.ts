/** "1250.00" → "₱1,250"; "1250.50" → "₱1,250.50". */
export function peso(amount: string | number) {
  const n = Number(amount);
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
