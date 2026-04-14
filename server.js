// White Shadows Agency - WebSocket Server with CORS
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

// === DISABLE CSP COMPLETELY ===
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Type-Options');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('X-XSS-Protection');
  next();
});

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// MongoDB Setup
const MONGODB_URI = 'mongodb+srv://xantoniomatta_db_user:3ANbuBGHPr5HlfrD@whiteshadowsdb.kgx3nj6.mongodb.net/?appName=WhiteShadowsDB';
const DB_NAME = 'white_shadows_agency';
const COLLECTION_NAME = 'messages';

let db, messagesCollection;

async function connectToDatabase() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        messagesCollection = db.collection(COLLECTION_NAME);
        console.log(`✅ Connected to MongoDB Atlas`);
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
    }
}
connectToDatabase();

// Agent Database
const AGENTS = {
  JIRO: { codename: 'JIRO', accessCode: 'ALPHA-7749', title: 'Chief · Division Alpha', alias: 'WARDEN', clearance: 'LEVEL 5', avatar: 'J' },
  REL: { codename: 'REL', accessCode: 'BETA-2281', title: 'Chief · Division Beta', clearance: 'LEVEL 4', avatar: 'R' },
  GYZAK: { codename: 'GYZAK', accessCode: 'DELTA-9934', title: 'Chief · Division Delta', clearance: 'LEVEL 4', avatar: 'G' },
  ANOTIC: { codename: 'ANOTIC', accessCode: 'SHADOW-5567', title: 'White Shadow', clearance: 'LEVEL 3', avatar: 'A' },
  ACE: { codename: 'ACE', accessCode: 'SURVEIL-1128', title: 'White Shadow', note: 'SURVEILLANCE', clearance: 'LEVEL 3', avatar: 'A' },
  SERA: { codename: 'SERA', accessCode: 'SHADOW-4402', title: 'White Shadow', clearance: 'LEVEL 3', avatar: 'S' }
};

const CHANNEL_PERMISSIONS = {
  'welcome': { read: 'all', write: ['JIRO', 'ACE'] },
  'division-alpha': { read: 'all', write: ['JIRO', 'ACE'] },
  'division-beta': { read: 'all', write: ['REL'] },
  'division-delta': { read: 'all', write: ['GYZAK'] },
  'briefing': { read: 'all', write: 'all' }
};

const clients = new Map();
const MAX_HISTORY = 100;

// === CORS ENDPOINT FOR REVONET ===
app.post('/verify-agent', (req, res) => {
  const { accessCode } = req.body;
  const agent = Object.entries(AGENTS).find(([name, data]) => data.accessCode === accessCode);
  
  if (agent) {
    res.json({ valid: true, agent: agent[0], title: agent[1].title, accessCode: agent[1].accessCode });
  } else {
    res.json({ valid: false });
  }
});

// Get all agents
app.get('/agents', (req, res) => {
  const agentList = Object.entries(AGENTS).map(([name, data]) => ({
    codename: name,
    accessCode: data.accessCode,
    title: data.title,
    alias: data.alias
  }));
  res.json({ agents: agentList });
});

console.log(`🔒 WHITE SHADOWS AGENCY - SERVER READY`);
console.log(`📍 Listening on port ${PORT}`);

function canWrite(agentName, channel) {
  const perm = CHANNEL_PERMISSIONS[channel];
  if (!perm) return false;
  if (perm.write === 'all') return true;
  return perm.write.includes(agentName);
}

wss.on('connection', (ws) => {
  let agentName = null;
  let authenticated = false;
  
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.send(JSON.stringify({ type: 'system', content: '⛔ AUTHENTICATION TIMEOUT' }));
      ws.close();
    }
  }, 10000);
  
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'login') {
        const requestedAgent = msg.agent;
        const providedCode = msg.accessCode;
        
        const agent = AGENTS[requestedAgent];
        if (!agent || agent.accessCode !== providedCode) {
          ws.send(JSON.stringify({ type: 'system', content: '⛔ ACCESS DENIED' }));
          ws.close();
          return;
        }
        
        
        agentName = requestedAgent;
        authenticated = true;
        clearTimeout(authTimeout);
        clients.set(ws, { name: agentName, agent });
        
        console.log(`✅ ${agentName} AUTHENTICATED`);
        
        ws.send(JSON.stringify({ type: 'system', content: `AUTHENTICATED AS ${agentName}`, agent: agentName }));
        ws.send(JSON.stringify({ type: 'channel_join', channel: 'welcome' }));
        
        if (messagesCollection) {
          try {
            const history = await messagesCollection.find().sort({ serverTimestamp: -1 }).limit(MAX_HISTORY).toArray();
            ws.send(JSON.stringify({ type: 'history', messages: history.reverse() }));
          } catch (e) {}
        }
        
        broadcast({ type: 'system', content: `🔹 ${agentName} JOINED` }, ws);
        
        const online = Array.from(clients.values()).map(c => c.name);
        broadcast({ type: 'online', agents: online });
        ws.send(JSON.stringify({ type: 'online', agents: online }));
      }
      
      else if (msg.type === 'chat' && authenticated) {
        const channel = msg.channel;
        
        if (!canWrite(agentName, channel)) {
          ws.send(JSON.stringify({ type: 'system', content: `⛔ ACCESS DENIED: You cannot write in #${channel}` }));
          return;
        }
        
        const agent = AGENTS[agentName];
        const messageData = {
          type: 'chat',
          sender: agentName,
          title: agent.title,
          content: msg.content,
          channel: channel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          serverTimestamp: new Date()
        };
        
        if (messagesCollection) {
          try { await messagesCollection.insertOne(messageData); } catch (e) {}
        }
        
        broadcast(messageData);
      }
      
      else if (msg.type === 'ace_watch' && authenticated) {
        if (agentName === 'ACE' || agentName === 'JIRO') {
          const aceAgent = AGENTS['ACE'];
          const messageData = {
            type: 'chat',
            sender: 'ACE',
            title: aceAgent.title,
            content: '👀',
            channel: msg.channel,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            serverTimestamp: new Date()
          };
          
          if (messagesCollection) {
            try { await messagesCollection.insertOne(messageData); } catch (e) {}
          }
          
          broadcast(messageData);
        }
      }
      
      else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      
      else if (msg.type === 'get_history' && authenticated) {
        const channel = msg.channel || 'welcome';
        if (messagesCollection) {
          try {
            const history = await messagesCollection.find({ channel }).sort({ serverTimestamp: -1 }).limit(MAX_HISTORY).toArray();
            ws.send(JSON.stringify({ type: 'history', messages: history.reverse(), channel }));
          } catch (e) {
            console.error('History fetch error:', e);
          }
        }
      }
      
    } catch (e) {
      console.error('Error:', e.message);
    }  
  });
  
  ws.on('close', () => {
    if (agentName) {
      console.log(`❌ ${agentName} DISCONNECTED`);
      broadcast({ type: 'system', content: `🔸 ${agentName} LEFT` });
      clients.delete(ws);
      const online = Array.from(clients.values()).map(c => c.name);
      broadcast({ type: 'online', agents: online });
    }
  });
});

function broadcast(message, exclude = null) {
  const data = JSON.stringify(message);
  clients.forEach((_, client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) client.send(data);
  });
}

server.listen(PORT, () => {
  console.log(`⚡ SERVER READY - AWAITING AGENTS`);
});
