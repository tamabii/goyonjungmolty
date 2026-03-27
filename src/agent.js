const https = require('https');
const fs = require('fs');
const path = require('path');

// Load config (not committed to git)
const CONFIG_PATH = process.env.CONFIG_PATH || './config.json';
let config;

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch(e) {
  console.error('Error loading config. Copy config.example.json to config.json and fill in your data.');
  process.exit(1);
}

const { agent_name, api_key, agent_wallet, target } = config;
const STATE_FILE = './data/state.json';
const LOG_FILE = './logs/agent.log';

// Ensure directories exist
['./data', './logs'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { matchCount: 0, totalSMoltz: 0, lastReport: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function apiRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cdn.moltyroyale.com',
      port: 443,
      path: '/api' + path,
      method: method,
      headers: {
        'X-API-Key': api_key,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let json = '';
      res.on('data', (chunk) => json += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(json)); }
        catch(e) { reject(new Error('Invalid JSON: ' + json.slice(0,200))); }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function checkAccount() {
  const res = await apiRequest('GET', '/accounts/me');
  if (res.success) return res.data;
  throw new Error('Account check failed');
}

async function findFreeGame() {
  const res = await apiRequest('GET', '/games?status=waiting');
  if (!res.success || !res.data) return null;
  return res.data.find(g => g.entryType === 'free');
}

async function createFreeGame() {
  try {
    const res = await apiRequest('POST', '/games', {
      hostName: `${agent_name}_${Date.now().toString(36)}`,
      entryType: 'free'
    });
    return res.success ? res.data : null;
  } catch(e) {
    if (e.message?.includes('WAITING_GAME_EXISTS')) return null;
    throw e;
  }
}

async function joinGame(gameId) {
  const res = await apiRequest('POST', `/games/${gameId}/agents/register`, { name: agent_name });
  if (res.success) return res.data;
  throw new Error(`Join failed: ${res.error?.code}`);
}

async function getGameState(gameId, agentId) {
  try {
    const res = await apiRequest('GET', `/games/${gameId}/agents/${agentId}/state`);
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}

async function submitAction(gameId, agentId, action) {
  try {
    const res = await apiRequest('POST', `/games/${gameId}/agents/${agentId}/actions`, action);
    return res.success;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function playGame(gameId, agentId, state) {
  log(`[Game] Playing ${gameId} as ${agentId}`);
  let turns = 0;
  
  while (turns < 500) {
    const gameState = await getGameState(gameId, agentId);
    if (!gameState) {
      log('[Game] State unavailable - ended');
      break;
    }
    
    if (gameState.gameStatus === 'finished' || (gameState.self && !gameState.self.isAlive)) {
      log('[Game] Finished or died');
      break;
    }
    
    const self = gameState.self;
    if (!self) {
      await sleep(5000);
      continue;
    }
    
    // Handle curse
    if (gameState.recentMessages) {
      const curse = gameState.recentMessages.find(m => m.content?.startsWith('[저주]'));
      if (curse) {
        const q = curse.content.replace('[저주]', '').trim();
        let ans = '0';
        try {
          const match = q.match(/(\d+)\s*\+\s*(\d+)/);
          if (match) ans = String(parseInt(match[1]) + parseInt(match[2]));
        } catch {}
        await submitAction(gameId, agentId, { type: 'whisper', targetId: curse.senderId, message: ans });
        log(`[Curse] ${q} -> ${ans}`);
      }
    }
    
    const region = gameState.currentRegion;
    
    // Death zone escape
    if (region?.isDeathZone && self.ep >= 3) {
      const safe = gameState.visibleRegions?.find(r => !r.isDeathZone);
      if (safe) {
        await submitAction(gameId, agentId, { type: 'move', targetId: safe.id });
        log('[Action] Move (escape death zone)');
        await sleep(6000);
        continue;
      }
    }
    
    // Low HP/EP - rest
    if (self.hp < 25 || self.ep < 3) {
      await submitAction(gameId, agentId, { type: 'rest' });
      log('[Action] Rest');
      await sleep(6000);
      continue;
    }
    
    // Attack weak agents
    const enemies = gameState.visibleAgents?.filter(a => a.id !== agentId && a.hp < self.hp);
    if (enemies?.length && self.ep >= 2) {
      const target = enemies[0];
      await submitAction(gameId, agentId, { type: 'attack', targetId: target.id });
      log(`[Action] Attack ${target.id.slice(0,8)}`);
      await sleep(6000);
      continue;
    }
    
    // Pick up items
    if (gameState.visibleItems?.length) {
      await submitAction(gameId, agentId, { type: 'pickup', itemId: gameState.visibleItems[0].id });
      log('[Action] Pickup');
      await sleep(5000);
      continue;
    }
    
    // Explore
    if (self.ep >= 2) {
      await submitAction(gameId, agentId, { type: 'explore' });
      log('[Action] Explore');
    } else {
      await submitAction(gameId, agentId, { type: 'rest' });
      log('[Action] Rest (low EP)');
    }
    
    await sleep(6000);
    turns++;
  }
}

async function main() {
  log('=== Molty Royale Agent Starting ===');
  
  const state = loadState();
  const account = await checkAccount();
  
  if (account.balance > state.totalSMoltz) {
    log(`[Earned] +${account.balance - state.totalSMoltz} sMoltz!`);
    state.totalSMoltz = account.balance;
    saveState(state);
  }
  
  if (state.matchCount >= target.max_matches || state.totalSMoltz >= target.smoltz) {
    log(`[Complete] ${state.matchCount} matches | ${state.totalSMoltz} sMoltz`);
    process.exit(0);
  }
  
  if (account.currentGames?.length > 0) {
    const g = account.currentGames[0];
    await playGame(g.gameId, g.agentId, state);
    state.matchCount++;
    saveState(state);
    log(`[Progress] Match ${state.matchCount}/${target.max_matches} | sMoltz: ${state.totalSMoltz}/${target.smoltz}`);
    return;
  }
  
  log('[Find] Looking for free game...');
  let game = await findFreeGame();
  
  if (!game) {
    log('[Create] No waiting game, creating...');
    game = await createFreeGame();
  }
  
  if (!game) {
    log('[Wait] No game available, will retry later');
    return;
  }
  
  log(`[Join] ${game.id}`);
  const agent = await joinGame(game.id);
  log(`[Joined] Agent ${agent.id.slice(0,8)} | HP:${agent.hp} EP:${agent.ep}`);
  
  await sleep(15000);
  await playGame(game.id, agent.id, state);
  state.matchCount++;
  saveState(state);
  
  log(`[Progress] Match ${state.matchCount}/${target.max_matches} | sMoltz: ${state.totalSMoltz}/${target.smoltz}`);
}

main().catch(e => {
  log('[Error] ' + e.message);
  process.exit(1);
});
