const net = require('net');
const readline = require('readline');
const envFilePath = './hosts.env';
const peers = [];
const host_type = process.argv[2];
const host_id = parseInt(process.argv[3]);
const fs = require('fs');
host_addr = -1;
host_port = -1;
// TEST

function readEnvFile() {
  // const peers = [];
  
  try {
    // Read the contents of the .env file
    const data = fs.readFileSync(envFilePath, 'utf8');
    
    // Split the contents into lines
    const lines = data.split('\n');
    
    // Parse each line and extract peer information
    lines.forEach(line => {
      const [type, id, host, port] = line.trim().split(',').map(item => item.trim());
      if (type && id && host && port) {
        if(type==host_type && parseInt(id)==host_id){
          host_addr = host;
          host_port = parseInt(port);
        }
        else{
          peers.push({ type, id: parseInt(id), host, port: parseInt(port) });
        }
      }
    });
  } catch (err) {
    console.error('Error reading .env file:', err.message);
  }
  
  // return peers;
}

// const port = parseInt(process.argv[2]);
// const peers = process.argv.slice(3).map(peer => ({ host: 'localhost', port: parseInt(peer) }));

// const peers = getPeersList()
readEnvFile();

const server = net.createServer(socket => {
  console.log('New connection from ' + socket.remoteAddress + ':' + socket.remotePort);
  // Store the newly connected socket
  connectToPeers();
  connections[socket.remoteAddress + ':' + socket.remotePort] = socket;

  socket.on('data', data => {
    console.log('Received data from ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + data.toString());
  });

  socket.on('close', () => {
    console.log('Connection with ' + socket.remoteAddress + ':' + socket.remotePort + ' closed');
    delete connections[socket.remoteAddress + ':' + socket.remotePort];
  });

  socket.on('error', err => {
    console.error('Error with ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + err.message);
  });
});

server.on('error', err => {
  console.error('Server error: ' + err.message);
});

server.listen(host_port, () => {
  console.log('Server started on port ' + host_port);
  connectToPeers();
});

const connections = {};

function connectToPeers() {
  peers.forEach(peer => {
    if(connections[peer.host+':'+peer.port]===undefined){
    const client = net.createConnection({ port: peer.port, host: peer.host }, () => {
      console.log('Connected to peer ' + peer.host + ':' + peer.port);
      connections[peer.host + ':' + peer.port] = client;
      
    //   client.on('data', data => {
    //     console.log('Received data from ' + peer.host + ':' + peer.port + ': ' + data.toString());
    //   });
    });
    client.on('error', err => {
      console.error('Error connecting to ' + peer.host + ':' + peer.port + ': ' + err.message);
    });
  }
});
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt user for input
rl.setPrompt('Enter message: ');

// Listen for user input
rl.on('line', input => {
  // Send input to all connected peers
  Object.values(connections).forEach(client => {
    client.write(input);
  });

  rl.prompt();
});

rl.prompt();