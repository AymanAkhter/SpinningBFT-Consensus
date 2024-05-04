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
processing = new Map();
state = 'normal';
isPrepared = false;
isPrePrepared = false;
prepared_count = 0;
commit_count = 0;
f = 0;
n = 3;
merge_count = 0;
prepared_request_digest = null;
commit_sent = false;
reply_sent = false;
isPrimary = false;
blacklist = [];
merge_list = []


let buffer = '';
function sleepSync(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

const delayMS = 15000; // Delay in ms
const timer = setTimeout(expireTimer, delayMS);
clearTimeout(timer);
// Processing is a map from {[<REQUEST, c, seq, op>, view_of_request] -> list of PREPARE messages corresponding to this request and view}

function startTimer (){
  timer = setTimeout(expireTimer, delayMS);
}

function stopTimer (){
  clearTimeout(timer);
}

function restartTimer(){
  timer(expireTimer, delayMS);
}

function expireTimer(){
  my_P = null;
  view_num = my_view; // This is the view number we will send in MERGE message
  for(const [key, value] in processing)
  {
    if(value.length>=2*f+1 && key[1]>=(v_last-n))
    {
      my_P = value;
    }
    if(state=='normal' && prepared_count>=f+1) // Is check for f+1 PRE-PREPARED really necessary doe?
    {
      view_num = my_view+1;
    }
  }
  state = 'merge';
  isPrepared = false;
  isPrePrepared = false;
  my_view++;
  restartTimer();
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

function sendPrePrepareMerge(){
  v_max = -1;
  VP = new Map();
  for(let i=0; i<merge_list.length; i++)
  {
    for(let j=0; j<(merge_list[i][3].length); j++)
    {
      if(merge_list[i][3][j][2] > v_max)
      {
        v_max = merge_list[i][3][j][2];
      }
    }
  }
  v_min = v_max-n;
  for(let i=0; i<(merge_list.length); i++)
  {
    MERGE = merge_list[i];
    MERGE.P = MERGE[3];
    VP.set(MERGE.P[0][2], MERGE.P[0][3]);
  }
  send_tuple = ['PRE-PREPARE-MERGE', host_id, my_view, VP, merge_list];
  json_data = JSON.stringify(send_tuple);
  Object.values(connections).forEach(connection => {
    const socket = connection[0];
    const peer = connection[1];
    if(peer.type=='Server'){
      flag_sent = flag_sent && socket.write(json_data + '\0');
    }
  });
  if(flag_sent)
  {
    console.error(`Server ${host_id} SENT PRE-PREPARE-MERGE to all`);
  }
  else
  {
    console.error(`Server ${host_id} couldn't SEND PRE-PREPARE-MERGE to all`); 
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
        // Store PRE-PREPARE messages in processing map
        if(processing.has([JSON.stringify(msg_tuple[3]), msg_tuple[2]]))
        {
          ;
        }
        else
        {
          processing.set([JSON.stringify(msg_tuple[3]), msg_tuple[2]], [ ]);
        }
        isPrepared = true;
        prepared_count++;
      }
    }

    if(msg_type=='PREPARE'){
      // console.log("Received PREPARE " + msg_tuple);
      // PREPARE message validity check
      if(msg_tuple[2]==my_view){ //Removed the second condition, check once
        prepared_count++;
        for(const [key, value] of processing)
        {
          if(key[1]==my_view && JSON.stringify(key[0][3])==JSON.stringify(msg_tuple[3]))
          {
            value.push(msg_tuple);
            break;
          }
        }
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
          for(const [key, value] of processing)

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
            else if((unordered.length)!=0){
              console.log("REQUEST DOES NOT EXIST");
            }
          }
          else{
            // merge stuff
          }
          v_last = my_view;
          
          isPrepared=false;
          isPrePrepared=false;
          prepared_count = 0;
          commit_count = 0;
          commit_sent = false;
          reply_sent = false;
          my_view++;
          while(blacklist.includes((my_view)%n))
          {
            my_view++;
          }
          if((my_view%n)==host_id){
            isPrimary=true;

            if(merge_count>=2*f+1)
            {
              sendPrePrepareMerge();
            }
            if(unordered.length!=0){
              sendPrePrepare();
            }
          }

          //something to do with pending
          
        }
      }
    }

    if(msg_type=='MERGE'){
      if(msg_tuple[2] >= v_last)
      {
        merge_count++;
        if(merge_count >= 2*f+1)
        {
          state = 'merge';
          isPrePrepared = false;
          isPrepared = false;
          for (const [key, value] of processing) {
            if (value.length >= 2 * f + 1 && key[1] >= v_last - n) {
                myP = value;
                send_tuple = ['MERGE', host_id, my_view, myP];
                json_data = JSON.stringify(send_tuple);
                let flag_sent = true; // Initialize flag_sent here
                Object.values(connections).forEach(connection => {
                    const socket = connection[0];
                    const peer = connection[1];
                    if (peer.type === 'Server') {
                        flag_sent = flag_sent && socket.write(json_data + '\0');
                    }
                });
                if (flag_sent) {
                    console.error(`Server ${host_id} SENT MERGE to all`);
                } else {
                    console.error(`Server ${host_id} couldn't SEND MERGE to all`);
                }
                break; // Break out of the loop after sending MERGE
            }
          }        
        }
      }
    }
    
    if(msg_tuple=='PRE-PREPARE-MERGE')
    {
      if(isPrePrepared==false && v >= v_last)
      {
        v_min = my_view+100;
        for(let i=0; i<(msg_tuple[4].length); i++)
        {
          if(msg_tuple[4][i][2]<v_min)
          {
            v_min = msg_tuple[4][i][2];
          }
        }
        if(v_last+1 >= v_min)
        {
          my_view = msg_tuple[2];
          dm = msg_tuple[3];
          isPrepared = true;
          state = 'normal';
          if(m_last < v_last)
          {
            if(blacklist.length==f)
            {
              blacklist.shift();
            }
            blacklist.push((my_view-1)%n);
          }
          else
          {
            blacklist[blacklist.length-1] = (my_view-1)%n;
          }
          m_last = my_view;
          send_tuple = ['PREPARE', host_id, my_view, dm];
          json_data = JSON.stringify(send_tuple);
          Object.values(connections).forEach(connection => {
            const socket = connection[0];
            const peer = connection[1];
            if(peer.type=='Server'){
              flag_sent = flag_sent && socket.write(json_data + '\0');
            }
          });
        }
        else
        {
          // StateTransfer()
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