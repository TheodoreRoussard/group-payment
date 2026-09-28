// Noms lisibles pour les identités de démo créées avec `stellar keys generate`.
// Une adresse absente de cette liste s'affiche simplement tronquée.
export const LABELS: Record<string, string> = {
  GARDNSSBU2MQ6CU4J6FLPOU2PIEDIFR7R34SE7DCIZUYRNEQYUDFROZX: 'Alice',
  GCDJJA7ARIM6C2WPN2DMJIYQRSZMTSWJ45ESANX4LUT3QKWTOZ47CP5V: 'Bob',
  GBW55AA62X5XPO3W2MRCGQDKJNW6PGXZLEPW5XSH7UYJADJWSUDRLCUV: 'Carol',
  GDLWWYIVZTPC43GMPSBRPJPV7L5FHRHLXGMXPAWGPZ46C3JFSPWEZILL: 'Propriétaire',
}

export function displayName(address: string): string | undefined {
  return LABELS[address]
}

/** Teinte stable dérivée de l'adresse, pour distinguer les avatars sans nom. */
export function hueOf(address: string): number {
  let h = 0
  for (const c of address) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
