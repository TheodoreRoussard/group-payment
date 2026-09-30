#![no_std]

//! Group payment : chaque participant dépose sa part dans le contrat (séquestre),
//! puis donne son accord. Dès que le dernier accord arrive, le contrat paie
//! automatiquement le destinataire, dans la même transaction.

use soroban_sdk::{
    Address, Env, Map, Vec, contract, contracterror, contractevent, contractimpl, contracttype,
    token::TokenClient,
};

/// Nombre maximal de participants : tout l'état tient dans l'instance storage,
/// chargée à chaque appel, donc on la garde petite.
const MAX_PARTICIPANTS: u32 = 50;

// ~5 s par ledger → 17 280 ledgers par jour.
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 90 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Collecte en cours : on peut contribuer, approuver, retirer.
    Open,
    /// Paiement envoyé au destinataire : état final, plus rien n'est possible.
    Executed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub token: Address,
    pub recipient: Address,
    /// Montant que chaque participant doit déposer (en unités du token, ex. stroops pour XLM).
    pub amount: i128,
    /// Timestamp Unix après lequel on ne peut plus contribuer ni approuver.
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Participant {
    pub contributed: bool,
    pub approved: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    Status,
    Participants,
    ApprovalCount,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoParticipants = 1,
    TooManyParticipants = 2,
    DuplicateParticipant = 3,
    InvalidAmount = 4,
    DeadlineInPast = 5,
    NotParticipant = 6,
    AlreadyContributed = 7,
    NotContributed = 8,
    AlreadyApproved = 9,
    DeadlinePassed = 10,
    AlreadyExecuted = 11,
}

#[contractevent]
pub struct Contributed {
    #[topic]
    pub participant: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Approved {
    #[topic]
    pub participant: Address,
    pub approvals: u32,
    pub required: u32,
}

#[contractevent]
pub struct Withdrawn {
    #[topic]
    pub participant: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Executed {
    #[topic]
    pub recipient: Address,
    pub total: i128,
}

#[contract]
pub struct GroupPayment;

#[contractimpl]
impl GroupPayment {
    /// Exécuté une seule fois, au déploiement. Aucune signature n'est demandée :
    /// déployer le contrat ne déplace l'argent de personne.
    pub fn __constructor(
        env: Env,
        token: Address,
        recipient: Address,
        participants: Vec<Address>,
        amount: i128,
        deadline: u64,
    ) -> Result<(), Error> {
        if participants.is_empty() {
            return Err(Error::NoParticipants);
        }
        if participants.len() > MAX_PARTICIPANTS {
            return Err(Error::TooManyParticipants);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::DeadlineInPast);
        }
        // Le total doit tenir dans un i128, sinon le paiement final échouerait.
        amount
            .checked_mul(participants.len() as i128)
            .ok_or(Error::InvalidAmount)?;

        let mut states: Map<Address, Participant> = Map::new(&env);
        for p in participants.iter() {
            if states.contains_key(p.clone()) {
                return Err(Error::DuplicateParticipant);
            }
            states.set(p, Participant::default());
        }

        let storage = env.storage().instance();
        storage.set(&DataKey::Config, &Config { token, recipient, amount, deadline });
        storage.set(&DataKey::Status, &Status::Open);
        storage.set(&DataKey::Participants, &states);
        storage.set(&DataKey::ApprovalCount, &0u32);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Étape 1 : le participant dépose sa part dans le contrat (séquestre).
    pub fn contribute(env: Env, from: Address) -> Result<(), Error> {
        from.require_auth();
        let config = Self::config(&env);
        Self::ensure_open(&env)?;
        Self::ensure_before_deadline(&env, &config)?;

        let mut states = Self::participants(&env);
        let mut state = states.get(from.clone()).ok_or(Error::NotParticipant)?;
        if state.contributed {
            return Err(Error::AlreadyContributed);
        }

        TokenClient::new(&env, &config.token).transfer(
            &from,
            &env.current_contract_address(),
            &config.amount,
        );

        state.contributed = true;
        states.set(from.clone(), state);
        env.storage().instance().set(&DataKey::Participants, &states);
        Self::bump(&env);

        Contributed { participant: from, amount: config.amount }.publish(&env);
        Ok(())
    }

    /// Étape 2 : le participant confirme qu'il est d'accord pour payer le destinataire.
    /// Si c'est le dernier accord manquant, le paiement part immédiatement.
    /// Retourne `true` si cet appel a déclenché le paiement.
    pub fn approve(env: Env, from: Address) -> Result<bool, Error> {
        from.require_auth();
        let config = Self::config(&env);
        Self::ensure_open(&env)?;
        Self::ensure_before_deadline(&env, &config)?;

        let mut states = Self::participants(&env);
        let mut state = states.get(from.clone()).ok_or(Error::NotParticipant)?;
        if !state.contributed {
            return Err(Error::NotContributed);
        }
        if state.approved {
            return Err(Error::AlreadyApproved);
        }

        state.approved = true;
        states.set(from.clone(), state);
        let approvals = Self::approval_count(&env) + 1;
        let required = states.len();

        let storage = env.storage().instance();
        storage.set(&DataKey::Participants, &states);
        storage.set(&DataKey::ApprovalCount, &approvals);
        Self::bump(&env);

        Approved { participant: from, approvals, required }.publish(&env);

        // Un accord n'est possible qu'après avoir contribué : approvals == required
        // implique donc que tout le monde a déposé sa part.
        if approvals < required {
            return Ok(false);
        }

        // Checks-effects-interactions : on fige l'état *avant* de transférer.
        storage.set(&DataKey::Status, &Status::Executed);
        let total = config.amount * required as i128;
        TokenClient::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &config.recipient,
            &total,
        );

        Executed { recipient: config.recipient, total }.publish(&env);
        Ok(true)
    }

    /// Filet de sécurité : tant que le paiement n'est pas parti, un participant peut
    /// récupérer sa part (avant ou après la deadline). Son accord est annulé avec.
    pub fn withdraw(env: Env, from: Address) -> Result<(), Error> {
        from.require_auth();
        let config = Self::config(&env);
        Self::ensure_open(&env)?;

        let mut states = Self::participants(&env);
        let state = states.get(from.clone()).ok_or(Error::NotParticipant)?;
        if !state.contributed {
            return Err(Error::NotContributed);
        }

        let storage = env.storage().instance();
        if state.approved {
            storage.set(&DataKey::ApprovalCount, &(Self::approval_count(&env) - 1));
        }
        states.set(from.clone(), Participant::default());
        storage.set(&DataKey::Participants, &states);
        Self::bump(&env);

        TokenClient::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &from,
            &config.amount,
        );

        Withdrawn { participant: from, amount: config.amount }.publish(&env);
        Ok(())
    }

    // --- Lecture seule ---

    pub fn get_config(env: Env) -> Config {
        Self::config(&env)
    }

    pub fn get_status(env: Env) -> Status {
        env.storage().instance().get(&DataKey::Status).unwrap()
    }

    pub fn get_participant(env: Env, who: Address) -> Result<Participant, Error> {
        Self::participants(&env).get(who).ok_or(Error::NotParticipant)
    }

    pub fn get_participants(env: Env) -> Map<Address, Participant> {
        Self::participants(&env)
    }

    pub fn get_approval_count(env: Env) -> u32 {
        Self::approval_count(&env)
    }
}

// Helpers internes : hors du bloc #[contractimpl], donc non appelables de l'extérieur.
impl GroupPayment {
    fn config(env: &Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    fn participants(env: &Env) -> Map<Address, Participant> {
        env.storage().instance().get(&DataKey::Participants).unwrap()
    }

    fn approval_count(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::ApprovalCount).unwrap()
    }

    fn ensure_open(env: &Env) -> Result<(), Error> {
        let status: Status = env.storage().instance().get(&DataKey::Status).unwrap();
        match status {
            Status::Open => Ok(()),
            Status::Executed => Err(Error::AlreadyExecuted),
        }
    }

    fn ensure_before_deadline(env: &Env, config: &Config) -> Result<(), Error> {
        if env.ledger().timestamp() > config.deadline {
            return Err(Error::DeadlinePassed);
        }
        Ok(())
    }

    fn bump(env: &Env) {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

mod test;
