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
  
  try {
    const data = fs.readFileSync(envFilePath, 'utf8');
    
    const lines = data.split('\n');
    
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
}

readEnvFile();
console.log(peers);

const server = net.createServer(socket => {
  console.log('New connection from ' + socket.remoteAddress + ':' + socket.remotePort);
  connectToPeers();

  socket.on('data', data => {
    console.log('Received data from ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + data.toString());
    const msg_tuple = JSON.parse(data);
    const msg_type = msg_tuple[0];

    if(msg_type=='REQUEST'){
        send_tuple = ['PRE-PREPARE', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
        json_data = JSON.stringify(send_tuple);
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Server'){
            socket.write(json_data);
          }
        });
    }
    if(msg_type=='PRE-PREPARE'){
        send_tuple = ['PREPARE', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
        json_data = JSON.stringify(send_tuple);
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Server'){
            socket.write(json_data);
          }
        });
    }
    if(msg_type=='PREPARE'){
        send_tuple = ['COMMIT', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
        json_data = JSON.stringify(send_tuple);
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Server'){
            socket.write(json_data);
          }
        });
    }
    if(msg_type=='COMMIT'){
        send_tuple = ['REPLY', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
        json_data = JSON.stringify(send_tuple);
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Client' && peer.id==msg_tuple[1]){
            console.log('RELELELELELELELELL');
            socket.write(json_data);
          }
        });
    }
    
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

// // Create readline interface
// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout
// });

// // Prompt user for input
// rl.setPrompt('Enter message: ');

// // Listen for user input
// rl.on('line', input => {
//   // Send input to all connected peers
//   Object.values(connections).forEach(client => {
    
//     client.write(input);
//   });

//   rl.prompt();
// });

// rl.prompt();