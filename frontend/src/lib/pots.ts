import type { PotInfo } from './stellar'

/** Un pot tel que l'interface le connaît : sa fiche + d'où il vient. */
export interface PotEntry extends PotInfo {
  /** Créé par le registre (ses events de création et d'invitation y sont). */
  fromFactory: boolean
}

// Le premier pot a été déployé directement en ligne de commande, avant le registre :
// il n'y figure pas, donc on le décrit ici.
const DEMO_POT_ID = import.meta.env.VITE_DEMO_POT_ID as string | undefined

export const DEMO_POTS: PotEntry[] = DEMO_POT_ID
  ? [
      {
        id: -1,
        address: DEMO_POT_ID,
        owner: 'GDLWWYIVZTPC43GMPSBRPJPV7L5FHRHLXGMXPAWGPZ46C3JFSPWEZILL',
        title: 'Location à 3 · démo',
        participants: [
          'GARDNSSBU2MQ6CU4J6FLPOU2PIEDIFR7R34SE7DCIZUYRNEQYUDFROZX',
          'GCDJJA7ARIM6C2WPN2DMJIYQRSZMTSWJ45ESANX4LUT3QKWTOZ47CP5V',
          'GBW55AA62X5XPO3W2MRCGQDKJNW6PGXZLEPW5XSH7UYJADJWSUDRLCUV',
        ],
        amount: 1_000_000_000n,
        deadline: 1_791_218_153n,
        created_ledger: Number(import.meta.env.VITE_DEMO_POT_LEDGER),
        fromFactory: false,
      },
    ]
  : []
