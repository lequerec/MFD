// Quelques assertions natives suffisent ici ; pas besoin de dépendance pour ça.
export function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Attendu ${JSON.stringify(expected)}, reçu ${JSON.stringify(actual)}`);
  }
}

export function throws(callback: () => unknown): void {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error("Une erreur était attendue");
}
