const net = require('net');
const readline = require('readline');
const envFilePath = './hosts.env';
const peers = [];
const host_type = process.argv[2];
const host_id = parseInt(process.argv[3]);
const fs = require('fs');
host_addr = -1;
host_port = -1;
my_view = 1;
m_last = 0;
v_last = 0;
unordered = new Set();
pending = {};
processing = new Set();
state = 'normal';
isPrepared = false;
isPrePrepared = false;
prepared_count = 0;
commit_count = 0;
f = 1;
merge_count = 0;
prepared_request_digest = null;
commit_sent = false;
isPrimary = false;

function startTimer (){

}

function stopTimer (){

}

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
      console.log("Received REQUEST " + msg_tuple);
      // TODO : Crytpo check!
      unordered.add(msg_tuple);
      // Make sure timer is not started multiple times

      startTimer();
        // send_tuple = ['PRE-PREPARE', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
        // json_data = JSON.stringify(send_tuple);
        // Object.values(connections).forEach(connection => {
        //   const socket = connection[0];
        //   const peer = connection[1];
        //   if(peer.type=='Server'){
        //     socket.write(json_data);
        //   }
        // });
    }

    if(msg_type=='PRE-PREPARE'){
      console.log("Received PRE-PREPARE " + msg_tuple);
      // Check validity of PRE-PREPARE message
      if(msg_tuple[2]==my_view && my_view-1 == v_last && isPrepared==false && state == 'normal'){
        // Send PREPARE to all servers
        send_tuple = ['PREPARE', host_id, my_view, prepared_request_digest];
        json_data = JSON.stringify(send_tuple);
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Server'){
            socket.write(json_data);
          }
        });

        // Augement processing, set isPrepared
        processing.add(json_data);
        isPrepared = true;
        prepared_count++;
      }
    }

    if(msg_type=='PREPARE'){
      console.log("Received PREPARE " + msg_tuple);
      // PREPARE message validity check
      if(msg_tuple[2]==my_view && msg_tuple[3]==prepared_request_digest){
        prepared_count++;
        if(prepared_count >= (2*f+1) && commit_sent==false){
          if(state=='normal'){
            send_tuple = ['COMMIT', host_id, my_view];
            json_data = JSON.stringify(send_tuple);
            Object.values(connections).forEach(connection => {
              const socket = connection[0];
              const peer = connection[1];
              if(peer.type=='Server'){
                socket.write(json_data);
              }
            });
            commit_sent = true;
            commit_count++;
          }
        }
      }
    }

    if(msg_type=='COMMIT'){
      console.log("Received COMMIT " + msg_tuple);
      if(msg_tuple[2]==my_view){
        commit_count++;
        if(commit_count >= 2*f+1){
          stopTimer();
          send_tuple = ['REPLY', msg_tuple[1], msg_tuple[2], msg_tuple[3]];
          json_data = JSON.stringify(send_tuple);
          Object.values(connections).forEach(connection => {
            const socket = connection[0];
            const peer = connection[1];
            if(peer.type=='Client' && peer.id==msg_tuple[1]){
              socket.write(json_data);
            }
          });
        }
      }
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