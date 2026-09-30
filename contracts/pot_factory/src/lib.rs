#![no_std]

//! Registre de pots communs : un propriétaire crée un pot (une instance du contrat
//! `group_payment` dont il est le destinataire) et y invite des participants.
//! Le registre garde, pour chaque adresse, la liste des pots qui la concernent :
//! c'est ce qui permet à l'interface d'afficher les invitations, depuis n'importe
//! quel appareil, sans serveur.

use soroban_sdk::{
    Address, BytesN, ContractExecutable, Env, String, Vec, contract, contracterror, contractevent,
    contractimpl, contracttype, xdr::ToXdr,
};

const MAX_TITLE_LEN: u32 = 64;
/// Borne la taille de l'index par membre (une seule entrée de stockage).
const MAX_POTS_PER_MEMBER: u32 = 200;

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 90 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PotInfo {
    pub id: u32,
    pub address: Address,
    pub owner: Address,
    pub title: String,
    pub participants: Vec<Address>,
    pub amount: i128,
    pub deadline: u64,
    /// Ledger de création : point de départ pour lire les events du pot.
    pub created_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Hash du Wasm `group_payment` déjà uploadé sur le réseau.
    PotWasm,
    Token,
    Count,
    Pot(u32),
    /// Ids des pots où l'adresse est propriétaire ou participante.
    Member(Address),
}

// Codes à partir de 100 : les codes 1 à 11 sont ceux du contrat de pot, qui peuvent
// remonter jusqu'ici quand son constructeur refuse les paramètres.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidTitle = 100,
    OwnerIsParticipant = 101,
    TooManyPots = 102,
    PotNotFound = 103,
}

#[contractevent]
pub struct PotCreated {
    #[topic]
    pub pot: Address,
    #[topic]
    pub owner: Address,
    pub id: u32,
    pub title: String,
}

#[contractevent]
pub struct Invited {
    #[topic]
    pub participant: Address,
    #[topic]
    pub pot: Address,
    pub owner: Address,
}

#[contract]
pub struct PotFactory;

#[contractimpl]
impl PotFactory {
    /// `token` : l'actif dans lequel tous les pots sont libellés (le SAC du XLM ici).
    pub fn __constructor(env: Env, pot_wasm_hash: BytesN<32>, token: Address) {
        let storage = env.storage().instance();
        storage.set(&DataKey::PotWasm, &pot_wasm_hash);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::Count, &0u32);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Crée un pot dont `owner` est le destinataire, et y invite `participants`.
    /// Les règles du pot (participants, montant, échéance) sont figées à sa création.
    pub fn create_pot(
        env: Env,
        owner: Address,
        title: String,
        participants: Vec<Address>,
        amount: i128,
        deadline: u64,
    ) -> Result<Address, Error> {
        owner.require_auth();
        if title.is_empty() || title.len() > MAX_TITLE_LEN {
            return Err(Error::InvalidTitle);
        }
        if participants.contains(&owner) {
            return Err(Error::OwnerIsParticipant);
        }

        let storage = env.storage().instance();
        let id: u32 = storage.get(&DataKey::Count).unwrap();
        let wasm: BytesN<32> = storage.get(&DataKey::PotWasm).unwrap();
        let token: Address = storage.get(&DataKey::Token).unwrap();

        // Sel unique par pot : l'adresse du pot est dérivée du registre + ce sel.
        let salt: BytesN<32> = env.crypto().sha256(&id.to_xdr(&env)).into();
        // Le constructeur du pot valide le reste (participants, montant, échéance)
        // et fait échouer toute la transaction si quelque chose ne va pas.
        let pot = env.deployer().with_current_contract(salt).deploy_contract(
            ContractExecutable::Wasm(wasm),
            (token, owner.clone(), participants.clone(), amount, deadline),
        );

        let info = PotInfo {
            id,
            address: pot.clone(),
            owner: owner.clone(),
            title,
            participants: participants.clone(),
            amount,
            deadline,
            created_ledger: env.ledger().sequence(),
        };
        let persistent = env.storage().persistent();
        persistent.set(&DataKey::Pot(id), &info);
        persistent.extend_ttl(&DataKey::Pot(id), TTL_THRESHOLD, TTL_EXTEND_TO);
        storage.set(&DataKey::Count, &(id + 1));
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        // Création d'abord, invitations ensuite : l'ordre des events suit le récit.
        PotCreated { pot: pot.clone(), owner: owner.clone(), id, title: info.title.clone() }.publish(&env);
        Self::index(&env, &owner, id)?;
        for p in participants.iter() {
            Self::index(&env, &p, id)?;
            Invited { participant: p, pot: pot.clone(), owner: owner.clone() }.publish(&env);
        }
        Ok(pot)
    }

    // --- Lecture seule ---

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn get_pot(env: Env, id: u32) -> Result<PotInfo, Error> {
        env.storage().persistent().get(&DataKey::Pot(id)).ok_or(Error::PotNotFound)
    }

    /// Les pots `[start, start + limit)`, du plus ancien au plus récent.
    pub fn list(env: Env, start: u32, limit: u32) -> Vec<PotInfo> {
        let end = Self::count(env.clone()).min(start.saturating_add(limit.min(50)));
        let mut out = Vec::new(&env);
        for id in start..end {
            if let Some(info) = env.storage().persistent().get(&DataKey::Pot(id)) {
                out.push_back(info);
            }
        }
        out
    }

    /// Les pots où `member` est propriétaire ou participant.
    pub fn pots_of(env: Env, member: Address) -> Vec<PotInfo> {
        let ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::Member(member))
            .unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            if let Some(info) = env.storage().persistent().get(&DataKey::Pot(id)) {
                out.push_back(info);
            }
        }
        out
    }
}

impl PotFactory {
    fn index(env: &Env, member: &Address, id: u32) -> Result<(), Error> {
        let key = DataKey::Member(member.clone());
        let persistent = env.storage().persistent();
        let mut ids: Vec<u32> = persistent.get(&key).unwrap_or(Vec::new(env));
        if ids.len() >= MAX_POTS_PER_MEMBER {
            return Err(Error::TooManyPots);
        }
        ids.push_back(id);
        persistent.set(&key, &ids);
        persistent.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }
}

mod test;
