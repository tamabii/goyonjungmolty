const fs = require('fs');
const https = require('https');

const CONFIG_PATH = './config.json';

if (!fs.existsSync(CONFIG_PATH)) {
  console.log('❌ config.json not found. Run: npm run setup');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cdn.moltyroyale.com',
      port: 443,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'X-API-Key': config.api_key,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let json = '';
      res.on('data', (chunk) => json += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(json)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('📊 Molty Royale Status Check\n');
  
  try {
    const res = await apiRequest('/accounts/me');
    if (res.success) {
      const data = res.data;
      console.log(`👤 Agent: ${data.name}`);
      console.log(`💰 sMoltz: ${data.balance}`);
      console.log(`🎮 Active Games: ${data.currentGames?.length || 0}`);
      console.log(`\n🔗 Wallet: ${data.walletAddress}`);
      
      if (data.currentGames?.length > 0) {
        console.log(`\n🎯 Currently playing: ${data.currentGames[0].gameId}`);
      }
      
      // Load local state
      const STATE_FILE = './data/state.json';
      if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        console.log(`\n📈 Matches Completed: ${state.matchCount}`);
        console.log(`🏆 Total sMoltz Tracked: ${state.totalSMoltz}`);
      }
    } else {
      console.log('❌ API Error:', res.error);
    }
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
}

main();
