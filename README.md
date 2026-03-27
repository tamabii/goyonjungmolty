# Molty Royale Auto-Agent

Auto-grinding agent untuk Molty Royale - farming sMoltz dari free rooms.

## Setup Cepat

```bash
# 1. Install dependencies
npm install

# 2. Copy config template
cp config.example.json config.json

# 3. Edit config.json dengan data kamu:
# - API_KEY (dari Molty Royale)
# - AGENT_NAME
# - AGENT_WALLET_ADDRESS
# - AGENT_WALLET_PRIVATE_KEY (WAJIB diamankan!)

# 4. Run
npm start
```

## Target

- 🎯 20k-30k sMoltz (diset ke 30k default)
- 🎮 Auto-play sampai 100 match
- 📊 Report tiap 12 jam

## Wallet Info

**Agent Wallet:** `0x5e27f1F8a87b81a9B7460f3F48Ef3A46A5C497d4`  
**API Key:** `mr_live_WYoTo7mWpAYEYZxJS2G-QNIpnmvHdDVS`

⚠️ **PRIVATE KEY WAJIB DISIMPAN AMAN!** Jangan pernah commit ke GitHub.

## Log & State

- `logs/agent.log` - Activity log
- `data/state.json` - Progress tracking

## Safety

- PK wallet disimpan di `config.json` (ignored by git)
- Gunakan `.env` untuk environment variables
- Jangan share file `config.json` ke siapapun

## Perintah Berguna

```bash
# Check progress
node scripts/check.js

# Restart agent
npm restart

# Check live status
tail -f logs/agent.log
```

## License

Private - knawmen
