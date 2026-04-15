# StellarDEX — Level 4 Green Belt

[![CI](https://github.com/[USERNAME]/stellar-dex/actions/workflows/ci.yml/badge.svg)](https://github.com/[USERNAME]/stellar-dex/actions/workflows/ci.yml)
[![Deploy](https://github.com/[USERNAME]/stellar-dex/actions/workflows/deploy.yml/badge.svg)](https://github.com/[USERNAME]/stellar-dex/actions/workflows/deploy.yml)
[![Stellar Testnet](https://img.shields.io/badge/Stellar-Testnet-purple)](https://stellar.expert)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)

> A production-ready mini decentralized exchange built with Soroban
> smart contracts, featuring inter-contract calls, a custom SVLT token,
> and a fully responsive frontend.

## Live Demo
**URL:** [FILL IN — Vercel URL]
**CI/CD:** [FILL IN — GitHub Actions URL]

## Screenshots
### Mobile Responsive View (375px)
<!-- Screenshot: phone-width showing swap panel, bottom nav bar -->

### CI/CD Pipeline Running
<!-- Screenshot or badge showing green CI checks -->

### Wallet Options Modal
<!-- Screenshot showing StellarWalletsKit modal with all wallet options -->

## Level 4 Requirements Met
| Requirement | Status | Implementation |
|---|---|---|
| Inter-contract calls | ✅ | Registry→Pool→Token (3-contract chain) |
| Custom token deployed | ✅ | SVLT token (stellar_token contract) |
| Liquidity pool deployed | ✅ | XLM/SVLT pool (liquidity_pool contract) |
| CI/CD running | ✅ | GitHub Actions: test + build + deploy |
| Mobile responsive | ✅ | Mobile-first Tailwind, bottom nav on mobile |
| Advanced event streaming | ✅ | Adaptive polling, visibility API |
| 8+ meaningful commits | ✅ | See git log |

## Tech Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS, mobile-first |
| Wallet | StellarWalletsKit (allowAllModules) |
| Blockchain | Stellar SDK + Soroban RPC |
| Contracts | Rust, Soroban SDK 21 (3 contracts) |
| Testing | Vitest + Rust cargo test (11+ tests) |
| CI/CD | GitHub Actions |
| Deployment | Vercel |
| Charts | Recharts |

## Architecture

Contract call chain (inter-contract calls):
```
pool_registry ──▶ liquidity_pool ──▶ stellar_token
  (register_pool    (swap calls       (transfer called
   calls pool's      token's           by pool)
   get_pool_info)    transfer)
```

Frontend structure:
```
/          — Swap + token info
/pool      — Add/remove liquidity
/activity  — Live event stream
```

## Smart Contracts

### stellar_token (SVLT)
**Contract ID:** [FILL IN]
**Explorer:** https://stellar.expert/explorer/testnet/contract/[FILL IN]

| Function | Description |
|---|---|
| initialize | Set admin, mint initial supply |
| transfer | Move SVLT between addresses |
| mint | Admin: create new SVLT |
| burn | Destroy SVLT tokens |
| approve / transfer_from | ERC20-style allowances |

### liquidity_pool (XLM/SVLT)
**Contract ID:** [FILL IN]
**Explorer:** https://stellar.expert/explorer/testnet/contract/[FILL IN]
**Inter-contract calls:** Calls stellar_token.transfer() for every swap/liquidity op

| Function | Description |
|---|---|
| add_liquidity | Deposit XLM + SVLT, receive LP tokens |
| remove_liquidity | Burn LP tokens, receive XLM + SVLT |
| swap_xlm_for_token | x*y=k AMM swap with 0.3% fee |
| swap_token_for_xlm | Reverse swap |
| get_price | Read current reserves |

### pool_registry
**Contract ID:** [FILL IN]
**Explorer:** https://stellar.expert/explorer/testnet/contract/[FILL IN]
**Inter-contract calls:** Calls liquidity_pool.get_pool_info() on register and query

| Function | Description |
|---|---|
| register_pool | Add pool (calls pool to verify) |
| get_pool_stats | Proxy call to pool contract |
| get_total_liquidity | Aggregate TVL across pools |

## Inter-Contract Call Transaction
**Registration tx (registry→pool):** [FILL IN]
**Initial liquidity tx (pool→token):** [FILL IN]
Verify: https://stellar.expert/explorer/testnet/tx/[FILL IN]

## Token Address
**SVLT Token:** [FILL IN]
**Pool Address:** [FILL IN]

## CI/CD Pipeline

GitHub Actions runs on every push to main:
1. **Rust Contract Tests** — cargo test for all 3 contracts (11 tests)
2. **Frontend Tests** — vitest (5 tests) + TypeScript check + ESLint
3. **Build** — Next.js production build with contract env vars
4. **Deploy** — Automatic Vercel deployment on green CI

Add these GitHub Secrets:
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `NEXT_PUBLIC_TOKEN_CONTRACT_ID`, `NEXT_PUBLIC_POOL_CONTRACT_ID`, `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`

## Mobile Responsive Design
- Mobile-first Tailwind: all components designed at 375px first
- Bottom navigation bar on mobile (<768px)
- Touch targets minimum 44px
- Adaptive font sizes (text-sm sm:text-base lg:text-lg)
- Safe area inset support (env(safe-area-inset-bottom))
- Tested: 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1280px (desktop)

## Error Handling
| Error | Trigger | UI |
|---|---|---|
| WalletNotFoundError | No wallet extension | Warning + install link |
| WalletRejectedError | User cancels signing | Info + retry |
| InsufficientBalanceError | Low XLM | Error + Friendbot link |
| SlippageExceededError | Price impact >5% | Warning + reduce amount hint |
| ContractError | Contract execution fail | Error + message |

## Advanced Event Streaming
ActivityFeed uses adaptive polling:
- Visible tab: polls every 8 seconds
- Hidden tab: backs off to 12 seconds (Visibility API)
- New events highlighted with flash animation
- Events parsed from Horizon transaction records for POOL + REGISTRY contracts

## Setup & Installation

### Prerequisites
Node.js 18+, Rust + Cargo, Stellar CLI, Freighter wallet

### Run Locally
```bash
git clone [your-repo-url]
cd stellar-dex
npm install
cp .env.local.example .env.local
# Fill in contract IDs (or run deploy script below)
npm run dev
```

### Deploy Contracts
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
# Outputs contract IDs to .env.local automatically
```

### Run Tests
```bash
npm test                    # Vitest (5 frontend tests)
cargo test --workspace      # Rust contract tests (11 tests)
```

## Git History
(Paste output of `git log --oneline` here)

## Wallet Support
Freighter · xBull · Albedo · Rabet · Lobstr · Hana · WalletConnect
