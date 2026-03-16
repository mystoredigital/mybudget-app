import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: 'COP' | 'USD' = 'COP') {
  return new Intl.NumberFormat(currency === 'COP' ? 'es-CO' : 'en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(amount);
}
