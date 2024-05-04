const net = require('net');
const http = require('http');
const readline = require('readline');
const envFilePath = './hosts.env';
const peers = [];
const host_type = process.argv[2];
const host_id = parseInt(process.argv[3]);
const fs = require('fs');
host_addr = -1;
host_port = -1;
my_view = 0;
m_last = 0;
v_last = -1;
unordered = [];
pending = {};
processing = [];
state = 'normal';
isPrepared = false;
isPrePrepared = false;
prepared_count = 0;
commit_count = 0;
f = 0;
merge_count = 0;
prepared_request_digest = null;
commit_sent = false;
reply_sent = false;
isPrimary = false;
let buffer = '';
function sleepSync(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}


function startTimer (){

}

function stopTimer (){

}

function exec(request){
  return 1;
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
if(my_view==host_id){
  isPrimary=true;
}

// self_connection = [net.createConnection({port : host_port, host: host_addr}),{ type : 'Server', id: host_id, host_addr, port : host_port }]

function sendPrePrepare(){
  if((my_view-1 == v_last) && (state=='normal') && isPrePrepared==false){
    // Need to check for empty list condition 
    // UPDATE: (Ok i fixed something so it shouldnt happen)

    console.log("In sendPrepPrepare");
    dm = unordered[0];
    unordered.shift();
    send_tuple = ['PRE-PREPARE', host_id, my_view, dm];
    json_data = JSON.stringify(send_tuple);
    Object.values(connections).forEach(connection => {
      const socket = connection[0];
      const peer = connection[1];
      if(peer.type=='Server'){
        socket.write(json_data + '\0');
      }
    });
    isPrePrepared = true;
  }
}

const server = net.createServer(socket => {
  console.log('New connection from ' + socket.remoteAddress + ':' + socket.remotePort);
  connectToPeers();

  socket.on('data', data => {
    buffer += data.toString();
    const delimIndex = buffer.indexOf('\0');
    if(delimIndex!==-1)
    {
      data = buffer.substring(0, delimIndex);
    }
    buffer = '';
    console.log('Received data from ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + data.toString());
    const msg_tuple = JSON.parse(data);
    const msg_type = msg_tuple[0];

    if(msg_type=='REQUEST'){
      // console.log("Received REQUEST " + msg_tuple);
      // TODO : Crytpo check!
      console.log("In Request");
      unordered.push(msg_tuple);
      if(unordered.length==1 && isPrimary==true){
        console.log("In Request - In IF block");
        sendPrePrepare();
      }
      // Make sure timer is not started multiple times

      startTimer();
    }

    if(msg_type=='PRE-PREPARE'){
      // console.log("Received PRE-PREPARE " + msg_tuple);
      // Check validity of PRE-PREPARE message
      if(msg_tuple[2]==my_view && my_view-1 == v_last && isPrepared==false && state == 'normal'){
        // Send PREPARE to all servers
        send_tuple = ['PREPARE', host_id, my_view, msg_tuple[3]];
        json_data = JSON.stringify(send_tuple);
        flag_sent = true;
        Object.values(connections).forEach(connection => {
          const socket = connection[0];
          const peer = connection[1];
          if(peer.type=='Server'){
            flag_sent = flag_sent && socket.write(json_data + '\0');
          }
        });
        if(flag_sent)
        {
          console.error(`Server ${host_id} SENT PREPARE to all`);
        }
        else
        {
          console.error(`Server ${host_id} couldn't SEND PREPARE to all`); 
        }

        // Augement processing, set isPrepared
        processing.push(['PRE-PREPARE', host_id, my_view, msg_tuple[3]]);
        isPrepared = true;
        prepared_count++;
      }
    }

    if(msg_type=='PREPARE'){
      // console.log("Received PREPARE " + msg_tuple);
      // PREPARE message validity check
      if(msg_tuple[2]==my_view){ //Removed the second condition, check once
        prepared_count++;
        if(prepared_count >= (2*f+1) && commit_sent==false){
          if(state=='normal'){
            send_tuple = ['COMMIT', host_id, my_view];
            json_data = JSON.stringify(send_tuple);
            sleepSync(5000);
            flag_sent = true;
            Object.values(connections).forEach(connection => {
              const socket = connection[0];
              const peer = connection[1];
              if(peer.type=='Server'){
                flag_sent = flag_sent && socket.write(json_data + '\0');
              }
            });
            if(flag_sent)
            {
              console.error(`Server ${host_id} SENT COMMIT to all`);
            }
            else
            {
              console.error(`Server ${host_id} couldn't SEND COMMIT to all`); 
            }
            commit_sent = true;
            commit_count++;
          }
        }
      }
    }

    // If replied, and isPrimary and unordered in non empty, then sendPreprepare

    if(msg_type=='COMMIT'){
      // console.log("Received COMMIT " + msg_tuple);
      if(msg_tuple[2]==my_view){
        commit_count++;
        if(commit_count >= 2*f+1 && reply_sent==false){
          if(state=='normal'){
            stopTimer();
          }
          request = null;
          for(i=0; i<processing.length; i++){
            if(processing[i][2]==my_view){
              request = processing[i];
            }
          }

          if(request!=null){
            reply = exec(request);
            send_tuple = ['REPLY', host_id, reply];
            json_data = JSON.stringify(send_tuple);
            Object.values(connections).forEach(connection => {
              const socket = connection[0];
              const peer = connection[1];
              if(peer.type=='Client' && peer.id==request[1]){
                socket.write(json_data + '\0');
              }
            });
            remove_index = -1;
            for(i=0; i<unordered.length; i++){
              console.log(JSON.stringify(unordered[i]), JSON.stringify(request[3]), JSON.stringify(unordered[i])==JSON.stringify(request[3]), JSON.stringify(unordered[i])===JSON.stringify(request[3]));
              if(JSON.stringify(unordered[i])==JSON.stringify(request[3])){
                remove_index = i;
                break;
              }
            }
            // console.log(unordered);
            // console.log(request[3])
            if(remove_index!=-1){
              unordered.splice(remove_index,1);
            }
            else if(length(unordered)!=0){
              console.log("REQUEST DOES NOT EXIST");
            }
          }
          else{
            // merge stuff
          }
          v_last = my_view;
          // some blacklist shit after this

          // reset variables
          isPrepared=false;
          isPrePrepared=false;
          prepared_count = 0;
          commit_count = 0;
          commit_sent = false;
          reply_sent = false;
          
          my_view++;
          if(my_view==host_id){
            isPrimary=true;


            if(unordered.length!=0){
              sendPrePrepare();
            }
          }

          //something to do with pending
          
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