#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token::TokenClient, Address, Env,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    TokenContract,
    FeeBps,
    XlmReserve,
    TokenReserve,
    TotalLp,
    LpBalance(Address),
}

fn integer_sqrt(n: i128) -> i128 {
    if n <= 0 { return 0; }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[contract]
pub struct LiquidityPool;

#[contractimpl]
impl LiquidityPool {
    pub fn initialize(env: Env, token_contract: Address, fee_bps: u32) {
        if env.storage().instance().has(&symbol_short!("init")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("init"), &true);
        env.storage().persistent().set(&DataKey::TokenContract, &token_contract);
        env.storage().persistent().set(&DataKey::FeeBps, &fee_bps);
        env.storage().persistent().set(&DataKey::XlmReserve, &0i128);
        env.storage().persistent().set(&DataKey::TokenReserve, &0i128);
        env.storage().persistent().set(&DataKey::TotalLp, &0i128);
    }

    pub fn add_liquidity(env: Env, provider: Address, xlm_amount: i128, token_amount: i128) -> i128 {
        provider.require_auth();
        let token = TokenClient::new(&env, &env.storage().persistent().get(&DataKey::TokenContract).unwrap());
        token.transfer(&provider, &env.current_contract_address(), &token_amount);

        let total_lp: i128 = env.storage().persistent().get(&DataKey::TotalLp).unwrap();
        let xlm_reserve: i128 = env.storage().persistent().get(&DataKey::XlmReserve).unwrap();
        let token_reserve: i128 = env.storage().persistent().get(&DataKey::TokenReserve).unwrap();

        let lp_mint = if total_lp == 0 {
            integer_sqrt(xlm_amount * token_amount)
        } else {
            let lp_x = xlm_amount * total_lp / xlm_reserve;
            let lp_t = token_amount * total_lp / token_reserve;
            if lp_x < lp_t { lp_x } else { lp_t }
        };

        env.storage().persistent().set(&DataKey::XlmReserve, &(xlm_reserve + xlm_amount));
        env.storage().persistent().set(&DataKey::TokenReserve, &(token_reserve + token_amount));
        let key = DataKey::LpBalance(provider.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(bal + lp_mint));
        env.storage().persistent().set(&DataKey::TotalLp, &(total_lp + lp_mint));
        env.events().publish(("add_liquidity",), (provider, xlm_amount, token_amount, lp_mint));
        lp_mint
    }

    pub fn remove_liquidity(env: Env, provider: Address, lp_amount: i128) -> (i128, i128) {
        provider.require_auth();
        let total_lp: i128 = env.storage().persistent().get(&DataKey::TotalLp).unwrap();
        let xlm_reserve: i128 = env.storage().persistent().get(&DataKey::XlmReserve).unwrap();
        let token_reserve: i128 = env.storage().persistent().get(&DataKey::TokenReserve).unwrap();

        let xlm_out = lp_amount * xlm_reserve / total_lp;
        let token_out = lp_amount * token_reserve / total_lp;

        let key = DataKey::LpBalance(provider.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap();
        env.storage().persistent().set(&key, &(bal - lp_amount));
        env.storage().persistent().set(&DataKey::TotalLp, &(total_lp - lp_amount));
        env.storage().persistent().set(&DataKey::XlmReserve, &(xlm_reserve - xlm_out));
        env.storage().persistent().set(&DataKey::TokenReserve, &(token_reserve - token_out));

        let token = TokenClient::new(&env, &env.storage().persistent().get(&DataKey::TokenContract).unwrap());
        token.transfer(&env.current_contract_address(), &provider, &token_out);
        env.events().publish(("remove_liquidity",), (provider, xlm_out, token_out));
        (xlm_out, token_out)
    }

    pub fn swap_xlm_for_token(env: Env, buyer: Address, xlm_in: i128) -> i128 {
        buyer.require_auth();
        let fee_bps: u32 = env.storage().persistent().get(&DataKey::FeeBps).unwrap();
        let xlm_reserve: i128 = env.storage().persistent().get(&DataKey::XlmReserve).unwrap();
        let token_reserve: i128 = env.storage().persistent().get(&DataKey::TokenReserve).unwrap();

        let xlm_in_with_fee = xlm_in * (10000 - fee_bps as i128) / 10000;
        let token_out = token_reserve * xlm_in_with_fee / (xlm_reserve + xlm_in_with_fee);

        env.storage().persistent().set(&DataKey::XlmReserve, &(xlm_reserve + xlm_in));
        env.storage().persistent().set(&DataKey::TokenReserve, &(token_reserve - token_out));

        let token = TokenClient::new(&env, &env.storage().persistent().get(&DataKey::TokenContract).unwrap());
        token.transfer(&env.current_contract_address(), &buyer, &token_out);
        env.events().publish(("swap", "xlm_to_token"), (buyer, xlm_in, token_out));
        token_out
    }

    pub fn swap_token_for_xlm(env: Env, seller: Address, token_in: i128) -> i128 {
        seller.require_auth();
        let token = TokenClient::new(&env, &env.storage().persistent().get(&DataKey::TokenContract).unwrap());
        token.transfer(&seller, &env.current_contract_address(), &token_in);

        let fee_bps: u32 = env.storage().persistent().get(&DataKey::FeeBps).unwrap();
        let xlm_reserve: i128 = env.storage().persistent().get(&DataKey::XlmReserve).unwrap();
        let token_reserve: i128 = env.storage().persistent().get(&DataKey::TokenReserve).unwrap();

        let token_in_with_fee = token_in * (10000 - fee_bps as i128) / 10000;
        let xlm_out = xlm_reserve * token_in_with_fee / (token_reserve + token_in_with_fee);

        env.storage().persistent().set(&DataKey::XlmReserve, &(xlm_reserve - xlm_out));
        env.storage().persistent().set(&DataKey::TokenReserve, &(token_reserve + token_in));
        env.events().publish(("swap", "token_to_xlm"), (seller, token_in, xlm_out));
        xlm_out
    }

    pub fn get_price(env: Env) -> (i128, i128) {
        (
            env.storage().persistent().get(&DataKey::XlmReserve).unwrap(),
            env.storage().persistent().get(&DataKey::TokenReserve).unwrap(),
        )
    }

    pub fn get_lp_balance(env: Env, provider: Address) -> i128 {
        env.storage().persistent().get(&DataKey::LpBalance(provider)).unwrap_or(0)
    }

    pub fn get_pool_info(env: Env) -> (i128, i128, i128, u32) {
        (
            env.storage().persistent().get(&DataKey::XlmReserve).unwrap(),
            env.storage().persistent().get(&DataKey::TokenReserve).unwrap(),
            env.storage().persistent().get(&DataKey::TotalLp).unwrap(),
            env.storage().persistent().get(&DataKey::FeeBps).unwrap(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;
    use stellar_token::{StellarVaultToken, StellarVaultTokenClient};

    #[test]
    fn test_initial_pool_is_empty() {
        let env = Env::default();
        let token_id = env.register_contract(None, StellarVaultToken);
        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        pool_client.initialize(&token_id, &30u32);
        let (xlm, token, lp, _fee) = pool_client.get_pool_info();
        assert_eq!(xlm, 0);
        assert_eq!(token, 0);
        assert_eq!(lp, 0);
    }

    #[test]
    fn test_add_liquidity_mints_lp_tokens() {
        let env = Env::default();
        let token_id = env.register_contract(None, StellarVaultToken);
        let token_client = StellarVaultTokenClient::new(&env, &token_id);
        let provider = Address::generate(&env);
        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        token_client.initialize(&provider, &100_000_000_000);
        pool_client.initialize(&token_id, &30u32);

        env.mock_all_auths_allowing_non_root_auth();
        let lp_mint = pool_client.add_liquidity(&provider, &1_000_000, &1_000_000);
        assert!(lp_mint > 0);
        assert_eq!(pool_client.get_lp_balance(&provider), lp_mint);
    }

    #[test]
    fn test_swap_returns_nonzero_tokens() {
        let env = Env::default();
        let token_id = env.register_contract(None, StellarVaultToken);
        let token_client = StellarVaultTokenClient::new(&env, &token_id);
        let provider = Address::generate(&env);
        let buyer = Address::generate(&env);
        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        token_client.initialize(&provider, &100_000_000_000);
        pool_client.initialize(&token_id, &30u32);

        env.mock_all_auths_allowing_non_root_auth();
        pool_client.add_liquidity(&provider, &1_000_000, &1_000_000);

        env.mock_all_auths_allowing_non_root_auth();
        let token_out = pool_client.swap_xlm_for_token(&buyer, &100_000);
        assert!(token_out > 0);
    }

    #[test]
    fn test_fee_bps_stored_correctly() {
        let env = Env::default();
        let token_id = env.register_contract(None, StellarVaultToken);
        let pool_id = env.register_contract(None, LiquidityPool);
        let pool_client = LiquidityPoolClient::new(&env, &pool_id);

        pool_client.initialize(&token_id, &30u32);
        let (_, _, _, fee) = pool_client.get_pool_info();
        assert_eq!(fee, 30);
    }
}
