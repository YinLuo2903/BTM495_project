/** Card details as typed: cardholder name, number with spaces, expiry "MM/YY", CVC. */
export interface CardDetails {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}

export type CardErrors = Partial<Record<keyof CardDetails, string>>;

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** "4242424242424242" (or partial input) → "4242 4242 4242 4242", max 16 digits. */
export function formatCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1229" → "12/29"; inserts the slash after the month, max 4 digits. */
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/**
 * 2–50 characters of letters (any language), spaces, hyphens, apostrophes and
 * periods, starting with a letter. Must match card_errors() on the server.
 */
export function isValidCardholderName(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= 50 && /^\p{L}[\p{L} '.-]*$/u.test(name);
}

/** Luhn checksum used by real card numbers; catches most typos. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/**
 * Format rules for the mock card form; an empty result means every field is valid.
 * Mirrors the server (16 digits, MM/YY not expired, 3-digit CVC) and adds the Luhn check.
 */
export function validateCard({ cardholderName, cardNumber, expiry, cvc }: CardDetails, today = new Date()): CardErrors {
  const errors: CardErrors = {};
  if (!isValidCardholderName(cardholderName)) errors.cardholderName = "Enter the name as it appears on the card.";
  const number = digitsOnly(cardNumber);
  if (number.length !== 16 || !passesLuhn(number)) errors.cardNumber = "Enter a valid 16-digit card number.";

  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  const month = match ? Number(match[1]) : 0;
  if (!match || month < 1 || month > 12) {
    errors.expiry = "Enter the expiry date as MM/YY.";
  } else {
    // A card is valid through the last day of its expiry month.
    const endOfMonth = new Date(2000 + Number(match[2]), month, 0, 23, 59, 59);
    if (endOfMonth < today) errors.expiry = "This card has expired.";
  }

  if (!/^\d{3}$/.test(cvc)) errors.cvc = "Enter the 3-digit CVC.";
  return errors;
}
