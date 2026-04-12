const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

const AGENTS = {
  JIRO: { codename: 'JIRO', accessCode: 'ALPHA-7749', title: 'Chief · Division Alpha', alias: 'WARDEN', clearance: 'LEVEL 5', avatar: 'J' },
  REL: { codename: 'REL', accessCode: 'BETA-2281', title: 'Chief · Division Beta', clearance: 'LEVEL 4', avatar: 'R' },
  GYZAK: { codename: 'GYZAK', accessCode: 'DELTA-9934', title: 'Chief · Division Delta', clearance: 'LEVEL 4', avatar: 'G' },
  ANOTIC: { codename: 'ANOTIC', accessCode: 'SHADOW-5567', title: 'White Shadow', clearance: 'LEVEL 3', avatar: 'A' },
  ACE: { codename: 'ACE', accessCode: 'SURVEIL-1128', title: 'White Shadow', note: 'SURVEILLANCE', clearance: 'LEVEL 3', avatar: 'A' },
  SERA: { codename: 'SERA', accessCode: 'SHADOW-4402', title: 'White Shadow', clearance: 'LEVEL 3', avatar: 'S' }
};

const messageHistory = { alpha: [], beta: [], delta: [], briefing: [] };
const MAX_HISTORY = 100;
const clients = new Map();

console.log(`WHITE SHADOWS AGENCY - SERVER READY`);

server.on('connection', (ws) => {
  let agentName = null;
  let authenticated = false;
  
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.send(JSON.stringify({ type: 'system', content: 'AUTHENTICATION TIMEOUT' }));
      ws.close();
    }
  }, 10000);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'login') {
        const agent = AGENTS[msg.agent];
        if (!agent || agent.accessCode !== msg.accessCode) {
          ws.send(JSON.stringify({ type: 'system', content: 'ACCESS DENIED' }));
          ws.close();
          return;
        }
        
        let connected = false;
        clients.forEach((c) => { if (c.name === msg.agent) connected = true; });
        if (connected) {
          ws.send(JSON.stringify({ type: 'system', content: 'ALREADY CONNECTED' }));
          ws.close();
          return;
        }
        
        agentName = msg.agent;
        authenticated = true;
        clearTimeout(authTimeout);
        clients.set(ws, { name: agentName, agent });
        
        ws.send(JSON.stringify({ type: 'system', content: `AUTHENTICATED AS ${agentName}`, agent: agentName }));
        
        Object.keys(messageHistory).forEach(channel => {
          if (messageHistory[channel].length > 0) {
            ws.send(JSON.stringify({ type: 'history', channel, messages: messageHistory[channel] }));
          }
        });
        
        broadcast({ type: 'system', content: `${agentName} JOINED` }, ws);
        
        const online = Array.from(clients.values()).map(c => c.name);
        ws.send(JSON.stringify({ type: 'online', agents: online }));
      }
      
      else if (msg.type === 'chat' && authenticated) {
        const agent = AGENTS[agentName];
        const messageData = {
          type: 'chat',
          sender: agentName,
          title: agent.title,
          content: msg.content,
          channel: msg.channel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        if (messageHistory[msg.channel]) {
          messageHistory[msg.channel].push(messageData);
          if (messageHistory[msg.channel].length > MAX_HISTORY) messageHistory[msg.channel].shift();
        }
        
        broadcast(messageData);
      }
      
      else if (msg.type === 'ace_watch' && authenticated) {
        if (agentName === 'ACE' || agentName === 'JIRO') {
          const messageData = {
            type: 'chat',
            sender: 'ACE',
            title: 'White Shadow',
            content: '👀',
            channel: msg.channel,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          
          if (messageHistory[msg.channel]) {
            messageHistory[msg.channel].push(messageData);
            if (messageHistory[msg.channel].length > MAX_HISTORY) messageHistory[msg.channel].shift();
          }
          
          broadcast(messageData);
        }
      }
    } catch (e) {}
  });
  
  ws.on('close', () => {
    if (agentName) {
      broadcast({ type: 'system', content: `${agentName} LEFT` });
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