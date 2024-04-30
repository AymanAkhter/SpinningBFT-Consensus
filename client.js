const net = require('net');
const readline = require('readline');
const envFilePath = './hosts.env';
const peers = [];
const host_type = process.argv[2];
const host_id = parseInt(process.argv[3]);
const fs = require('fs');
host_addr = -1;
host_port = -1;

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
        if(type=='Server'){
          peers.push({ type, id: parseInt(id), host, port: parseInt(port) });
        }
      }
    });
  } catch (err) {
    console.error('Error reading .env file:', err.message);
  }
  
}

readEnvFile();

const server = net.createServer(socket => {
  console.log('New connection from ' + socket.remoteAddress + ':' + socket.remotePort);
  // Store the newly connected socket
  connectToPeers();

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
      connections[peer.host + ':' + peer.port] = [client,peer];
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

var seq = 0;

// Prompt user for input
rl.setPrompt('Enter message: ');

// Listen for user input
rl.on('line', input => {
  Object.values(connections).forEach(connection => {
    const msg_tuple = ['REQUEST', host_id, seq, input]
    const json_data = JSON.stringify(msg_tuple);
    const client = connection[0];
    (client).write(json_data);
  });
  seq++;
  rl.prompt();
});

rl.prompt();