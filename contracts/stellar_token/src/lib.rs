#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address),
}

fn get_balance(env: &Env, addr: &Address) -> i128 {
    env.storage().persistent().get(&DataKey::Balance(addr.clone())).unwrap_or(0)
}

fn set_balance(env: &Env, addr: &Address, amount: i128) {
    env.storage().persistent().set(&DataKey::Balance(addr.clone()), &amount);
}

fn get_total_supply(env: &Env) -> i128 {
    env.storage().persistent().get(&DataKey::TotalSupply).unwrap_or(0)
}

#[contract]
pub struct StellarVaultToken;

#[contractimpl]
impl StellarVaultToken {
    pub fn initialize(env: Env, admin: Address, initial_supply: i128) {
        if env.storage().instance().has(&symbol_short!("init")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("init"), &true);
        env.storage().persistent().set(&DataKey::Admin, &admin);
        set_balance(&env, &admin, initial_supply);
        env.storage().persistent().set(&DataKey::TotalSupply, &initial_supply);
    }

    pub fn name(env: Env) -> String { String::from_str(&env, "StellarVault Token") }
    pub fn symbol(env: Env) -> String { String::from_str(&env, "SVLT") }
    pub fn decimals(_env: Env) -> u32 { 7 }

    pub fn total_supply(env: Env) -> i128 { get_total_supply(&env) }
    pub fn balance(env: Env, owner: Address) -> i128 { get_balance(&env, &owner) }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_bal = get_balance(&env, &from);
        if from_bal < amount { panic!("insufficient balance"); }
        set_balance(&env, &from, from_bal - amount);
        set_balance(&env, &to, get_balance(&env, &to) + amount);
        env.events().publish(("transfer",), (from, to, amount));
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let allowance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if allowance < amount { panic!("insufficient allowance"); }
        env.storage().persistent().set(&key, &(allowance - amount));
        Self::transfer(env.clone(), from.clone(), to, amount);
    }

    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128) {
        owner.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(owner.clone(), spender.clone()), &amount);
        env.events().publish(("approve",), (owner, spender, amount));
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(owner, spender))
            .unwrap_or(0)
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(get_total_supply(&env) + amount));
        set_balance(&env, &to, get_balance(&env, &to) + amount);
        env.events().publish(("mint",), (to, amount));
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        let bal = get_balance(&env, &from);
        if bal < amount { panic!("insufficient balance"); }
        set_balance(&env, &from, bal - amount);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(get_total_supply(&env) - amount));
        env.events().publish(("burn",), (from, amount));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_initialize_sets_supply() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarVaultToken);
        let client = StellarVaultTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        client.initialize(&admin, &1_000_000_000);
        assert_eq!(client.total_supply(), 1_000_000_000);
        assert_eq!(client.balance(&admin), 1_000_000_000);
    }

    #[test]
    fn test_transfer_moves_balance() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarVaultToken);
        let client = StellarVaultTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin, &1_000_000_000);
        env.mock_all_auths_allowing_non_root_auth();
        client.transfer(&admin, &user, &100_000);
        assert_eq!(client.balance(&admin), 999_900_000);
        assert_eq!(client.balance(&user), 100_000);
    }

    #[test]
    fn test_mint_increases_supply() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarVaultToken);
        let client = StellarVaultTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin, &1_000_000_000);
        env.mock_all_auths_allowing_non_root_auth();
        client.mint(&user, &500_000);
        assert_eq!(client.total_supply(), 1_000_500_000);
        assert_eq!(client.balance(&user), 500_000);
    }

    #[test]
    fn test_burn_decreases_supply() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarVaultToken);
        let client = StellarVaultTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        client.initialize(&admin, &1_000_000_000);
        env.mock_all_auths_allowing_non_root_auth();
        client.burn(&admin, &200_000);
        assert_eq!(client.total_supply(), 999_800_000);
        assert_eq!(client.balance(&admin), 999_800_000);
    }
}
