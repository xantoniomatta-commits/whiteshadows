// White Shadows Agency - Secure WebSocket Server
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

// Connected clients with their identities
const clients = new Map();

// Agent database (same as client)
const AGENTS = {
  JIRO: { title: 'Chief · Division Alpha', alias: 'WARDEN', clearance: 'LEVEL 5' },
  REL: { title: 'Chief · Division Beta', clearance: 'LEVEL 4' },
  GYZAK: { title: 'Chief · Division Delta', clearance: 'LEVEL 4' },
  ANOTIC: { title: 'White Shadow', clearance: 'LEVEL 3' },
  ACE: { title: 'White Shadow', note: 'SURVEILLANCE', clearance: 'LEVEL 3' },
  SERA: { title: 'White Shadow', clearance: 'LEVEL 3' }
};

console.log(`🔒 WHITE SHADOWS AGENCY SERVER`);
console.log(`📍 Listening on port ${PORT}`);

server.on('connection', (ws) => {
  let agentName = null;
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Handle login
      if (msg.type === 'login') {
        agentName = msg.agent;
        const agent = AGENTS[agentName] || { title: 'OPERATIVE' };
        
        clients.set(ws, { name: agentName, agent });
        ws.send(JSON.stringify({
          type: 'system',
          content: `AUTHENTICATED AS ${agentName}`,
          agent: agentName,
          profile: agent
        }));
        
        // Broadcast join to others
        broadcast({
          type: 'system',
          content: `${agentName} JOINED THE CHANNEL`,
          sender: 'SYSTEM'
        }, ws);
        
        // Send current online list
        const online = Array.from(clients.values()).map(c => c.name);
        ws.send(JSON.stringify({
          type: 'online',
          agents: online
        }));
        
        console.log(`✅ ${agentName} connected`);
      }
      
      // Handle chat messages
      else if (msg.type === 'chat' && agentName) {
        const agent = AGENTS[agentName] || { title: 'OPERATIVE' };
        broadcast({
          type: 'chat',
          sender: agentName,
          title: agent.title,
          alias: agent.alias,
          content: msg.content,
          channel: msg.channel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
      
      // Handle Ace bot simulation (👀)
      else if (msg.type === 'ace_watch') {
        broadcast({
          type: 'chat',
          sender: 'ACE',
          title: 'White Shadow',
          content: '👀',
          channel: msg.channel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
      
    } catch (e) {
      console.error('Message error:', e);
    }
  });
  
  ws.on('close', () => {
    if (agentName) {
      console.log(`❌ ${agentName} disconnected`);
      broadcast({
        type: 'system',
        content: `${agentName} LEFT THE CHANNEL`,
        sender: 'SYSTEM'
      });
      clients.delete(ws);
    }
  });
});

function broadcast(message, exclude = null) {
  const data = JSON.stringify(message);
  clients.forEach((_, client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

console.log('⚡ SERVER READY - AWAITING AGENTS');