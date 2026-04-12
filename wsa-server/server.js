// White Shadows Agency - Secure WebSocket Server
// With Access Codes + Chat History

const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

// Agent Database with Secret Access Codes
const AGENTS = {
  JIRO: { 
    codename: 'JIRO', 
    accessCode: 'ALPHA-7749',
    title: 'Chief · Division Alpha', 
    alias: 'WARDEN', 
    clearance: 'LEVEL 5',
    avatar: 'J'
  },
  REL: { 
    codename: 'REL', 
    accessCode: 'BETA-2281',
    title: 'Chief · Division Beta', 
    clearance: 'LEVEL 4',
    avatar: 'R'
  },
  GYZAK: { 
    codename: 'GYZAK', 
    accessCode: 'DELTA-9934',
    title: 'Chief · Division Delta', 
    clearance: 'LEVEL 4',
    avatar: 'G'
  },
  ANOTIC: { 
    codename: 'ANOTIC', 
    accessCode: 'SHADOW-5567',
    title: 'White Shadow', 
    clearance: 'LEVEL 3',
    avatar: 'A'
  },
  ACE: { 
    codename: 'ACE', 
    accessCode: 'SURVEIL-1128',
    title: 'White Shadow', 
    note: 'SURVEILLANCE',
    clearance: 'LEVEL 3',
    avatar: 'A'
  },
  SERA: { 
    codename: 'SERA', 
    accessCode: 'SHADOW-4402',
    title: 'White Shadow', 
    clearance: 'LEVEL 3',
    avatar: 'S'
  }
};

// Chat History Storage (last 100 messages per channel)
const messageHistory = {
  alpha: [],
  beta: [],
  delta: [],
  briefing: []
};
const MAX_HISTORY = 100;

// Connected clients
const clients = new Map();

console.log(`🔒 WHITE SHADOWS AGENCY - SECURE SERVER`);
console.log(`📍 Listening on port ${PORT}`);

server.on('connection', (ws) => {
  let agentName = null;
  let authenticated = false;
  
  console.log(`📡 New connection attempt`);
  
  // Authentication timeout
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      console.log(`⏱️ Authentication timeout`);
      ws.send(JSON.stringify({ type: 'system', content: '⛔ AUTHENTICATION TIMEOUT' }));
      ws.close();
    }
  }, 10000);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // LOGIN with access code validation
      if (msg.type === 'login') {
        const requestedAgent = msg.agent;
        const providedCode = msg.accessCode;
        
        // Validate agent exists
        if (!AGENTS[requestedAgent]) {
          ws.send(JSON.stringify({ type: 'system', content: '⛔ ACCESS DENIED: UNKNOWN AGENT' }));
          ws.close();
          return;
        }
        
        // Validate access code
        if (AGENTS[requestedAgent].accessCode !== providedCode) {
          ws.send(JSON.stringify({ type: 'system', content: '⛔ ACCESS DENIED: INVALID ACCESS CODE' }));
          ws.close();
          return;
        }
        
        // Check if already connected
        let alreadyConnected = false;
        clients.forEach((client) => {
          if (client.name === requestedAgent) alreadyConnected = true;
        });
        
        if (alreadyConnected) {
          ws.send(JSON.stringify({ type: 'system', content: '⛔ ACCESS DENIED: AGENT ALREADY CONNECTED' }));
          ws.close();
          return;
        }
        
        // AUTHENTICATION SUCCESS
        agentName = requestedAgent;
        authenticated = true;
        clearTimeout(authTimeout);
        
        const agent = AGENTS[agentName];
        clients.set(ws, { name: agentName, agent: agent });
        
        console.log(`✅ ${agentName} AUTHENTICATED (${agent.title})`);
        
        // Send confirmation
        ws.send(JSON.stringify({
          type: 'system',
          content: `AUTHENTICATED AS ${agentName}`,
          agent: agentName,
          profile: { title: agent.title, alias: agent.alias, clearance: agent.clearance }
        }));
        
        // Send chat history for all channels
        Object.keys(messageHistory).forEach(channel => {
          if (messageHistory[channel].length > 0) {
            ws.send(JSON.stringify({
              type: 'history',
              channel: channel,
              messages: messageHistory[channel]
            }));
          }
        });
        
        // Broadcast join
        broadcast({
          type: 'system',
          content: `🔹 ${agentName} JOINED THE CHANNEL`,
          sender: 'SYSTEM'
        }, ws);
        
        // Send online list
        const online = Array.from(clients.values()).map(c => c.name);
        ws.send(JSON.stringify({ type: 'online', agents: online }));
        
        // Welcome message
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'system',
            content: `Welcome, ${agent.title}${agent.alias ? ' · ' + agent.alias : ''}. All channels secure.`
          }));
        }, 300);
      }
      
      // CHAT MESSAGE
      else if (msg.type === 'chat' && authenticated) {
        const agent = AGENTS[agentName];
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const messageData = {
          type: 'chat',
          sender: agentName,
          title: agent.title,
          alias: agent.alias,
          content: msg.content,
          channel: msg.channel,
          timestamp: timestamp
        };
        
        // Save to history
        if (messageHistory[msg.channel]) {
          messageHistory[msg.channel].push(messageData);
          if (messageHistory[msg.channel].length > MAX_HISTORY) {
            messageHistory[msg.channel].shift();
          }
        }
        
        console.log(`💬 ${agentName} in #${msg.channel}: ${msg.content.substring(0, 40)}`);
        broadcast(messageData);
      }
      
      // ACE SURVEILLANCE
      else if (msg.type === 'ace_watch' && authenticated) {
        if (agentName === 'ACE' || agentName === 'JIRO') {
          const aceAgent = AGENTS['ACE'];
          const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          const messageData = {
            type: 'chat',
            sender: 'ACE',
            title: aceAgent.title,
            content: '👀',
            channel: msg.channel,
            timestamp: timestamp
          };
          
          if (messageHistory[msg.channel]) {
            messageHistory[msg.channel].push(messageData);
            if (messageHistory[msg.channel].length > MAX_HISTORY) {
              messageHistory[msg.channel].shift();
            }
          }
          
          broadcast(messageData);
          console.log(`👀 Ace surveillance in #${msg.channel}`);
        }
      }
      
      // PING
      else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      
    } catch (e) {
      console.error('❌ Message error:', e.message);
    }
  });
  
  ws.on('close', () => {
    if (agentName && authenticated) {
      console.log(`❌ ${agentName} DISCONNECTED`);
      broadcast({ type: 'system', content: `🔸 ${agentName} LEFT THE CHANNEL`, sender: 'SYSTEM' });
      clients.delete(ws);
      
      const online = Array.from(clients.values()).map(c => c.name);
      broadcast({ type: 'online', agents: online });
    }
  });
  
  ws.on('error', (error) => {
    console.error(`⚠️ WebSocket error:`, error.message);
  });
});

function broadcast(message, exclude = null) {
  const data = JSON.stringify(message);
  clients.forEach((_, clientWs) => {
    if (clientWs !== exclude && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });
}

// Heartbeat
setInterval(() => {
  clients.forEach((_, ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 30000);

console.log('\n⚡ SERVER READY\n');