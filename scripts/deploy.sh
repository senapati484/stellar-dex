#!/bin/bash
set -e

echo "🚀 StellarDEX — Deploying contracts to testnet"

# ─────────────────────────────────────────
# SETUP — Check prerequisites
# ─────────────────────────────────────────
if ! command -v stellar &> /dev/null; then
  echo "❌ stellar CLI not found."
  echo "   Install it: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
  exit 1
fi

if ! command -v cargo &> /dev/null; then
  echo "❌ cargo not found. Install Rust: https://rustup.rs/"
  exit 1
fi

echo "✓ stellar CLI and cargo found"

# Generate/reuse deployer key
stellar keys generate --global deployer --network testnet 2>/dev/null || true
DEPLOYER=$(stellar keys address deployer)
echo "Deployer: $DEPLOYER"
echo "→ Funding via Friendbot..."
FRIENDBOT=$(curl -sf "https://friendbot.stellar.org?addr=$DEPLOYER" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "⚠  Friendbot faucet may be rate-limited or down. Ensure the address has test XLM."
else
  echo "✓ Funded via Friendbot"
fi

# ─────────────────────────────────────────
# BUILD ALL THREE
# ─────────────────────────────────────────
echo ""
echo "→ Building contracts for wasm32-unknown-unknown..."
cargo build --target wasm32-unknown-unknown --release \
  --manifest-path contracts/stellar_token/Cargo.toml
cargo build --target wasm32-unknown-unknown --release \
  --manifest-path contracts/liquidity_pool/Cargo.toml
cargo build --target wasm32-unknown-unknown --release \
  --manifest-path contracts/pool_registry/Cargo.toml
echo "✓ All contracts built"

# ─────────────────────────────────────────
# DEPLOY stellar_token
# ─────────────────────────────────────────
echo ""
echo "→ Deploying stellar_token..."
TOKEN_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_token.wasm \
  --source deployer --network testnet)
echo "✓ Token: $TOKEN_ID"

# Initialize: mint 10,000,000 SVLT to deployer (7 decimals: ×10_000_000)
echo "→ Initializing token (minting 10,000,000 SVLT to deployer)..."
TOKEN_INIT_TX=$(stellar contract invoke --id $TOKEN_ID \
  --source deployer --network testnet \
  -- initialize \
  --admin $DEPLOYER \
  --initial_supply 10000000000000)
echo "✓ Token initialized"

# ─────────────────────────────────────────
# DEPLOY liquidity_pool
# ─────────────────────────────────────────
echo ""
echo "→ Deploying liquidity_pool..."
POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/liquidity_pool.wasm \
  --source deployer --network testnet)
echo "✓ Pool: $POOL_ID"

echo "→ Initializing pool with token contract reference..."
POOL_INIT_TX=$(stellar contract invoke --id $POOL_ID \
  --source deployer --network testnet \
  -- initialize \
  --token_contract $TOKEN_ID \
  --fee_bps 30)
echo "✓ Pool initialized (inter-contract link set)"

# ─────────────────────────────────────────
# DEPLOY pool_registry
# ─────────────────────────────────────────
echo ""
echo "→ Deploying pool_registry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/pool_registry.wasm \
  --source deployer --network testnet)
echo "✓ Registry: $REGISTRY_ID"

echo "→ Initializing registry..."
stellar contract invoke --id $REGISTRY_ID \
  --source deployer --network testnet \
  -- initialize --admin $DEPLOYER

echo "→ Registering pool in registry..."
echo "   (This triggers: registry → pool.get_pool_info inter-contract call)"
REGISTER_TX=$(stellar contract invoke --id $REGISTRY_ID \
  --source deployer --network testnet \
  -- register_pool \
  --pool_id $POOL_ID \
  --token_contract $TOKEN_ID)
echo "✓ Pool registered in registry"
echo "✓ Inter-contract call verified"

# ─────────────────────────────────────────
# SEED LIQUIDITY (for demo)
# ─────────────────────────────────────────
echo ""
echo "→ Seeding initial liquidity..."
echo "   Approving pool to spend 500,000 SVLT from deployer..."
stellar contract invoke --id $TOKEN_ID \
  --source deployer --network testnet \
  -- approve \
  --owner $DEPLOYER \
  --spender $POOL_ID \
  --amount 500000000000

echo "   Adding liquidity: 1,000 XLM / 10,000 SVLT..."
LIQUIDITY_TX=$(stellar contract invoke --id $POOL_ID \
  --source deployer --network testnet \
  -- add_liquidity \
  --provider $DEPLOYER \
  --xlm_amount 1000000000 \
  --token_amount 1000000000000)
echo "✓ Initial liquidity seeded"

# ─────────────────────────────────────────
# WRITE ENV
# ─────────────────────────────────────────
cat > .env.local << EOF
NEXT_PUBLIC_TOKEN_CONTRACT_ID=$TOKEN_ID
NEXT_PUBLIC_POOL_CONTRACT_ID=$POOL_ID
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=$REGISTRY_ID
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_DEPLOYER=$DEPLOYER
EOF

echo "✓ .env.local written with contract IDs"

# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────
echo ""
echo "══════════════════════════════════════"
echo "✅ StellarDEX Deployment Complete"
echo "══════════════════════════════════════"
echo "Token (SVLT):   $TOKEN_ID"
echo "Pool (XLM/SVLT):$POOL_ID"
echo "Registry:       $REGISTRY_ID"
echo ""
echo "Explorer links:"
echo "  Token:    https://stellar.expert/explorer/testnet/contract/$TOKEN_ID"
echo "  Pool:     https://stellar.expert/explorer/testnet/contract/$POOL_ID"
echo "  Registry: https://stellar.expert/explorer/testnet/contract/$REGISTRY_ID"
echo ""
echo "Contract IDs saved to .env.local"
echo "══════════════════════════════════════"
