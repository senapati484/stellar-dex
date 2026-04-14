#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, String, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct PoolInfo {
    pub pool_id: Address,
    pub token_a: String,
    pub token_b: String,
    pub token_contract: Address,
    pub created_at: u64,
}

#[contract]
pub struct PoolRegistry;

#[contractimpl]
impl PoolRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("init")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("init"), &true);
        env.storage().persistent().set(&symbol_short!("admin"), &admin);
        env.storage().persistent().set(&symbol_short!("pools"), &Vec::<PoolInfo>::new(&env));
    }

    pub fn register_pool(env: Env, pool_id: Address, token_contract: Address) {
        let admin: Address = env.storage().persistent().get(&symbol_short!("admin")).unwrap();
        admin.require_auth();

        let _info: (i128, i128, i128, u32) = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_pool_info"),
            Vec::new(&env),
        );

        let mut pools: Vec<PoolInfo> = env.storage().persistent().get(&symbol_short!("pools")).unwrap();
        pools.push_back(PoolInfo {
            pool_id: pool_id.clone(),
            token_a: String::from_str(&env, "XLM"),
            token_b: String::from_str(&env, "SVLT"),
            token_contract,
            created_at: env.ledger().timestamp(),
        });
        env.storage().persistent().set(&symbol_short!("pools"), &pools);
        env.events().publish(("pool_registered",), pool_id);
    }

    pub fn get_pools(env: Env) -> Vec<PoolInfo> {
        env.storage().persistent().get(&symbol_short!("pools")).unwrap()
    }

    pub fn get_pool_count(env: Env) -> u32 {
        let pools: Vec<PoolInfo> = env.storage().persistent().get(&symbol_short!("pools")).unwrap();
        pools.len()
    }

    pub fn get_pool_stats(env: Env, pool_id: Address) -> (i128, i128, i128, u32) {
        env.invoke_contract(&pool_id, &Symbol::new(&env, "get_pool_info"), Vec::new(&env))
    }

    pub fn get_total_liquidity(env: Env) -> i128 {
        let pools: Vec<PoolInfo> = env.storage().persistent().get(&symbol_short!("pools")).unwrap();
        let mut total: i128 = 0;
        for i in 0..pools.len() {
            let pool = pools.get(i).unwrap();
            let stats: (i128, i128, i128, u32) = Self::get_pool_stats(env.clone(), pool.pool_id);
            total += stats.0;
        }
        total
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use liquidity_pool::{LiquidityPool, LiquidityPoolClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;
    use stellar_token::{StellarVaultToken, StellarVaultTokenClient};

    #[test]
    fn test_initialize_sets_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let registry_id = env.register_contract(None, PoolRegistry);
        let registry_client = PoolRegistryClient::new(&env, &registry_id);

        registry_client.initialize(&admin);
        assert_eq!(registry_client.get_pool_count(), 0);
    }

    #[test]
    fn test_register_pool_increments_count() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let token_id = env.register_contract(None, StellarVaultToken);
        let token_client = StellarVaultTokenClient::new(&env, &token_id);

        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        let registry_id = env.register_contract(None, PoolRegistry);
        let registry_client = PoolRegistryClient::new(&env, &registry_id);

        token_client.initialize(&provider, &100_000_000_000);
        pool_client.initialize(&token_id, &30u32);
        registry_client.initialize(&admin);

        env.mock_all_auths_allowing_non_root_auth();
        pool_client.add_liquidity(&provider, &1_000_000, &1_000_000);

        env.mock_all_auths_allowing_non_root_auth();
        registry_client.register_pool(&pool_id, &token_id);
        assert_eq!(registry_client.get_pool_count(), 1);
    }

    #[test]
    fn test_get_pools_returns_registered() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let token_id = env.register_contract(None, StellarVaultToken);
        let token_client = StellarVaultTokenClient::new(&env, &token_id);

        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        let registry_id = env.register_contract(None, PoolRegistry);
        let registry_client = PoolRegistryClient::new(&env, &registry_id);

        token_client.initialize(&provider, &100_000_000_000);
        pool_client.initialize(&token_id, &30u32);
        registry_client.initialize(&admin);

        env.mock_all_auths_allowing_non_root_auth();
        pool_client.add_liquidity(&provider, &1_000_000, &1_000_000);

        env.mock_all_auths_allowing_non_root_auth();
        registry_client.register_pool(&pool_id, &token_id);

        let pools = registry_client.get_pools();
        assert_eq!(pools.len(), 1);
        let first = pools.get(0).unwrap();
        assert_eq!(first.token_a, String::from_str(&env, "XLM"));
    }
}
