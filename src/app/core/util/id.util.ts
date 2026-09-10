export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1: se confunden al leerlos

/**
 * Identificador corto del bundle. Se quema en una esquina de cada imagen exportada: si el
 * usuario pega dos exportaciones distintas en el mismo chat, el modelo puede detectarlo en
 * vez de cruzar el "#4" de una con el JSON de la otra.
 */
export function newBundleId(): string {
  const pick = (): string => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const block = (): string => Array.from({ length: 4 }, pick).join('');
  return `${block()}-${block()}`;
}
