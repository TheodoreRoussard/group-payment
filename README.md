# Pot commun — paiement de groupe trustless sur Stellar

Un smart contract Soroban où chaque participant **verse sa part**, puis **donne son accord**.
Quand le dernier accord arrive, le contrat **paie automatiquement** le destinataire, dans la même transaction.
Tant que le paiement n'est pas parti, chacun peut **retirer** sa part.

## Aperçu

![Interface, thème clair](docs/apercu-clair.png)

<details><summary>Thème sombre</summary>

![Interface, thème sombre](docs/apercu-sombre.png)

</details>

## Structure

- `src/` : le contrat (Rust, `soroban-sdk` 28) et ses tests
- `frontend/` : l'interface web (Vite + React + TypeScript, Stellar Wallets Kit : Freighter, xBull, Lobstr, Albedo, Hana, Rabet)

## Déploiement testnet actuel

| | |
|---|---|
| Contrat | [`CCLJZERI6DO2FCXCSMYR5VAHBTFGX5HFKRQEVJRXTDREIXT2VAQOFSDX`](https://stellar.expert/explorer/testnet/contract/CCLJZERI6DO2FCXCSMYR5VAHBTFGX5HFKRQEVJRXTDREIXT2VAQOFSDX) |
| Token | XLM natif (SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) |
| Participants | 3 × 100 XLM |

## Contrat

```bash
cargo test                # tests unitaires
stellar contract build    # → target/wasm32v1-none/release/group_payment.wasm
```

| Fonction | Rôle |
|---|---|
| `__constructor(token, recipient, participants, amount, deadline)` | Fixe les règles une fois pour toutes |
| `contribute(from)` | Verse la part de `from` dans le contrat (séquestre) |
| `approve(from)` | Donne l'accord de `from` ; le dernier accord déclenche le paiement |
| `withdraw(from)` | Rend la part de `from` et annule son accord (tant que le paiement n'est pas parti) |
| `get_config`, `get_status`, `get_participants`, `get_participant`, `get_approval_count` | Lecture |

Déployer une nouvelle instance :

```bash
stellar contract deploy --wasm target/wasm32v1-none/release/group_payment.wasm \
  --source-account alice --network testnet -- \
  --token $(stellar contract id asset --asset native --network testnet) \
  --recipient <G...> --participants '["G...","G..."]' \
  --amount 1000000000 --deadline $(date -v+7d +%s)
```

## Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

L'adresse du contrat se règle dans `frontend/.env` (`VITE_CONTRACT_ID`, `VITE_START_LEDGER`).
Pour agir en tant que participant de démo, importez sa clé dans votre wallet (réseau Testnet) : `stellar keys secret bob`.

> Projet d'apprentissage, non audité : ne pas utiliser sur le mainnet en l'état.
