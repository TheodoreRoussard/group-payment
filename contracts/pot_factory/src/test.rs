#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    Address, Env, String, vec,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
};

// Le Wasm du pot doit être compilé avant ces tests : `stellar contract build`.
mod pot {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/group_payment.wasm");
}

const AMOUNT: i128 = 100;
const DEADLINE: u64 = 10_000;

struct Setup<'a> {
    env: Env,
    factory: PotFactoryClient<'a>,
    token: TokenClient<'a>,
    owner: Address,
    alice: Address,
    bob: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let token_id = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    let wasm_hash = env.deployer().upload_contract_wasm(pot::WASM);
    let factory_id = env.register(PotFactory, (wasm_hash, token_id.clone()));

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let sac = StellarAssetClient::new(&env, &token_id);
    sac.mint(&alice, &1_000);
    sac.mint(&bob, &1_000);

    Setup {
        factory: PotFactoryClient::new(&env, &factory_id),
        token: TokenClient::new(&env, &token_id),
        owner: Address::generate(&env),
        env,
        alice,
        bob,
    }
}

fn title(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[test]
fn creates_working_pot_and_indexes_members() {
    let s = setup();
    let participants = vec![&s.env, s.alice.clone(), s.bob.clone()];
    let pot_id = s.factory.create_pot(&s.owner, &title(&s.env, "Loyer"), &participants, &AMOUNT, &DEADLINE);

    // Le registre connaît le pot, et chaque membre le voit dans ses pots.
    assert_eq!(s.factory.count(), 1);
    let info = s.factory.get_pot(&0);
    assert_eq!(info.address, pot_id);
    assert_eq!(info.owner, s.owner);
    for member in [&s.owner, &s.alice, &s.bob] {
        assert_eq!(s.factory.pots_of(member), vec![&s.env, info.clone()]);
    }
    assert_eq!(s.factory.pots_of(&Address::generate(&s.env)).len(), 0);

    // Le pot déployé fonctionne : le propriétaire est bien le destinataire.
    let pot = pot::Client::new(&s.env, &pot_id);
    for p in [&s.alice, &s.bob] {
        pot.contribute(p);
    }
    pot.approve(&s.alice);
    assert!(pot.approve(&s.bob));
    assert_eq!(s.token.balance(&s.owner), 2 * AMOUNT);
}

#[test]
fn each_pot_gets_its_own_address() {
    let s = setup();
    let participants = vec![&s.env, s.alice.clone()];
    let a = s.factory.create_pot(&s.owner, &title(&s.env, "A"), &participants, &AMOUNT, &DEADLINE);
    let b = s.factory.create_pot(&s.owner, &title(&s.env, "B"), &participants, &AMOUNT, &DEADLINE);
    assert_ne!(a, b);
    assert_eq!(s.factory.list(&0, &10).len(), 2);
    assert_eq!(s.factory.list(&1, &10).get(0).unwrap().address, b);
    assert_eq!(s.factory.pots_of(&s.alice).len(), 2);
}

#[test]
fn rejects_invalid_pots() {
    let s = setup();
    let ok = vec![&s.env, s.alice.clone()];

    assert_eq!(
        s.factory.try_create_pot(&s.owner, &title(&s.env, ""), &ok, &AMOUNT, &DEADLINE),
        Err(Ok(Error::InvalidTitle))
    );
    assert_eq!(
        s.factory.try_create_pot(&s.owner, &title(&s.env, "X"), &vec![&s.env, s.owner.clone()], &AMOUNT, &DEADLINE),
        Err(Ok(Error::OwnerIsParticipant))
    );
    // Refus du constructeur du pot (montant nul) : rien n'est enregistré.
    assert!(s.factory.try_create_pot(&s.owner, &title(&s.env, "X"), &ok, &0, &DEADLINE).is_err());
    assert_eq!(s.factory.count(), 0);
    assert_eq!(s.factory.pots_of(&s.alice).len(), 0);
}

#[test]
fn create_pot_requires_owner_signature() {
    let s = setup();
    s.factory.create_pot(&s.owner, &title(&s.env, "Loyer"), &vec![&s.env, s.alice.clone()], &AMOUNT, &DEADLINE);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.owner);
}
