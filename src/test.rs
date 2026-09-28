#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    Address, Env, IntoVal, Symbol, vec,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger},
    token::{StellarAssetClient, TokenClient},
};

const AMOUNT: i128 = 100;
const START: u64 = 1_000;
const DEADLINE: u64 = 10_000;

struct Setup<'a> {
    env: Env,
    client: GroupPaymentClient<'a>,
    token: TokenClient<'a>,
    recipient: Address,
    alice: Address,
    bob: Address,
    carol: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(issuer).address();
    let sac = StellarAssetClient::new(&env, &token_id);

    let recipient = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    for p in [&alice, &bob, &carol] {
        sac.mint(p, &1_000);
    }

    let contract_id = env.register(
        GroupPayment,
        (
            token_id.clone(),
            recipient.clone(),
            vec![&env, alice.clone(), bob.clone(), carol.clone()],
            AMOUNT,
            DEADLINE,
        ),
    );

    Setup {
        client: GroupPaymentClient::new(&env, &contract_id),
        token: TokenClient::new(&env, &token_id),
        env,
        recipient,
        alice,
        bob,
        carol,
    }
}

#[test]
fn happy_path_pays_recipient_on_last_approval() {
    let s = setup();
    let contract = s.client.address.clone();

    for p in [&s.alice, &s.bob, &s.carol] {
        s.client.contribute(p);
    }
    assert_eq!(s.token.balance(&contract), 3 * AMOUNT);
    assert_eq!(s.token.balance(&s.alice), 1_000 - AMOUNT);

    assert!(!s.client.approve(&s.alice));
    assert!(!s.client.approve(&s.bob));
    assert_eq!(s.token.balance(&s.recipient), 0);

    // Le dernier accord déclenche le paiement dans la même transaction.
    assert!(s.client.approve(&s.carol));
    assert_eq!(s.token.balance(&s.recipient), 3 * AMOUNT);
    assert_eq!(s.token.balance(&contract), 0);
    assert_eq!(s.client.get_status(), Status::Executed);

    // Plus rien n'est possible après exécution.
    assert_eq!(s.client.try_withdraw(&s.alice), Err(Ok(Error::AlreadyExecuted)));
}

#[test]
fn contribute_requires_participant_signature() {
    let s = setup();
    s.client.contribute(&s.alice);

    assert_eq!(
        s.env.auths(),
        std::vec![(
            s.alice.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.client.address.clone(),
                    Symbol::new(&s.env, "contribute"),
                    (s.alice.clone(),).into_val(&s.env),
                )),
                // La signature couvre aussi le transfert de tokens déclenché par le contrat.
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.token.address.clone(),
                        Symbol::new(&s.env, "transfer"),
                        (s.alice.clone(), s.client.address.clone(), AMOUNT).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
}

#[test]
fn withdraw_refunds_and_cancels_approval() {
    let s = setup();
    s.client.contribute(&s.alice);
    s.client.approve(&s.alice);
    assert_eq!(s.client.get_approval_count(), 1);

    s.client.withdraw(&s.alice);
    assert_eq!(s.token.balance(&s.alice), 1_000);
    assert_eq!(s.client.get_approval_count(), 0);
    assert_eq!(s.client.get_participant(&s.alice), Participant::default());

    // Alice peut revenir dans le jeu.
    s.client.contribute(&s.alice);
    assert_eq!(s.token.balance(&s.alice), 1_000 - AMOUNT);
}

#[test]
fn withdraw_still_works_after_deadline() {
    let s = setup();
    s.client.contribute(&s.alice);
    s.env.ledger().set_timestamp(DEADLINE + 1);

    assert_eq!(s.client.try_approve(&s.alice), Err(Ok(Error::DeadlinePassed)));
    assert_eq!(s.client.try_contribute(&s.bob), Err(Ok(Error::DeadlinePassed)));
    s.client.withdraw(&s.alice);
    assert_eq!(s.token.balance(&s.alice), 1_000);
}

#[test]
fn rejects_invalid_actions() {
    let s = setup();
    let stranger = Address::generate(&s.env);

    assert_eq!(s.client.try_contribute(&stranger), Err(Ok(Error::NotParticipant)));
    assert_eq!(s.client.try_approve(&s.alice), Err(Ok(Error::NotContributed)));
    assert_eq!(s.client.try_withdraw(&s.alice), Err(Ok(Error::NotContributed)));

    s.client.contribute(&s.alice);
    assert_eq!(s.client.try_contribute(&s.alice), Err(Ok(Error::AlreadyContributed)));

    s.client.approve(&s.alice);
    assert_eq!(s.client.try_approve(&s.alice), Err(Ok(Error::AlreadyApproved)));
}

/// Le constructeur panique sur des paramètres invalides : le déploiement est annulé.
fn deploy_succeeds(participants: usize, duplicate: bool, amount: i128, deadline: u64) -> bool {
    std::panic::catch_unwind(|| {
        let env = Env::default();
        env.ledger().set_timestamp(START);
        let mut list = Vec::new(&env);
        for _ in 0..participants {
            list.push_back(Address::generate(&env));
        }
        if duplicate {
            list.push_back(list.get(0).unwrap());
        }
        let args = (Address::generate(&env), Address::generate(&env), list, amount, deadline);
        env.register(GroupPayment, args);
    })
    .is_ok()
}

#[test]
fn constructor_validates_inputs() {
    assert!(!deploy_succeeds(0, false, AMOUNT, DEADLINE)); // aucun participant
    assert!(!deploy_succeeds(2, true, AMOUNT, DEADLINE)); // doublon
    assert!(!deploy_succeeds(51, false, AMOUNT, DEADLINE)); // trop de participants
    assert!(!deploy_succeeds(2, false, 0, DEADLINE)); // montant nul
    assert!(!deploy_succeeds(2, false, AMOUNT, START)); // deadline déjà passée
    assert!(deploy_succeeds(2, false, AMOUNT, DEADLINE));
}
