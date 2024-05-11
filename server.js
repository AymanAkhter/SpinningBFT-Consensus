const net = require('net');
const readline = require('readline');
const envFilePath = './hosts.env';
const peers = [];
const host_type = process.argv[2];
const host_id = parseInt(process.argv[3]);
const fs = require('fs');
// const { request } = require('http');
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
merge_list = [];

checkPointBuffer = [];
checkPoint = [{my_view : my_view, m_last : m_last, v_last : v_last,
               unordered: unordered, pending : pending, processing:processing,
               state : state, isPrepared : isPrepared, isPrePrepared : isPrePrepared,
               prepared_count : prepared_count, commit_count : commit_count, 
               merge_count : merge_count, commit_sent : commit_sent, reply_sent : reply_sent, 
               blacklist : blacklist, merge_list : merge_list, prepared_request_digest : prepared_request_digest}
               , checkPointBuffer];



let buffer = '';
function sleepSync(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

const delayMS = 1500000; // Delay in ms
let timer = setTimeout(expireTimer, delayMS);
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

// self_connection = [net.createConnection({port : host_port, host: host_addr}),{ type : 'Server', id: host_id, host_addr, port : host_port }]

function sendPrePrepare(){
  if((my_view-1 == v_last) && (state=='normal') && isPrePrepared==false){
    // Need to check for empty list condition 
    // UPDATE: (Ok i fixed something so it shouldnt happen)

    // console.log("In sendPrepPrepare");
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
    if(processing.has([dm, my_view]))
    {
      ;
    }
    else
    {
      processing.set([dm, my_view]);
    }
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

function executeRequestAndLog(request, reply) {
  const logData = `${new Date().toISOString()} - Request: ${(request)}, Reply: ${(reply)}\n`;
  const logFileName = `server_${host_id}_log.txt`;

  if (!fs.existsSync(logFileName)) {
      fs.writeFileSync(logFileName, '');
  }

  fs.appendFile(logFileName, logData, (err) => {
      if (err) {
          console.error(`Error writing to log file ${logFileName}:`, err);
      } else {
          console.log(`Request logged to ${logFileName}`);
          console.log(unordered);
      }
  });
}

function reqStateTransfer(){
  send_tuple = ['STATE-TRANSFER', host_id];
  json_data = JSON.stringify(send_tuple);
  Object.values(connections).forEach(connection => {
    const socket = connection[0];
    const peer = connection[1];
    if(peer.type=='Server'){
      socket.write(json_data + '\0');
    }
  });
}

function StateTransferHandler(msg_tuple){
  send_tuple = ['STATE-REPLY', checkPoint];
  json_data = JSON.stringify(send_tuple);
  Object.values(connections).forEach(connection => {
    const socket = connection[0];
    const peer = connection[1];
    if(peer.type=='Server' && peer.id == msg_tuple[1]){
      socket.write(json_data + '\0');
    }
  });
}

function StateReplyHandler(msg_tuple){
  updateState(msg_tuple[1][0]);
  executeCommands(msg_tuple[1][1]);
}

function RequestHandler(msg_tuple){
  // console.log("Received REQUEST " + msg_tuple);
  // TODO : Crytpo check!
  // console.log("In Request");
  unordered.push(JSON.stringify(msg_tuple));
  if(unordered.length==1 && isPrimary==true){
    // console.log("In Request - In IF block");
    sendPrePrepare();
  }
  // Make sure timer is not started multiple times

  startTimer();
}

function PrePrepareHandler(msg_tuple){
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
    if(processing.has([(msg_tuple[3]), msg_tuple[2]]))
    {
      ;
    }
    else
    {
      processing.set([(msg_tuple[3]), msg_tuple[2]], [ ]);
    }
    isPrepared = true;
    prepared_count++;
  }
}

function PrepareHandler(msg_tuple){
  // console.log("Received PREPARE " + msg_tuple);
  // PREPARE message validity check
  if(msg_tuple[2]==my_view){ //Removed the second condition, check once
    prepared_count++;
    for(const [key, value] of processing)
    {
      // No value being pushed into processing idk why
      if(key[1]==my_view && (key[0][3])==(msg_tuple[3]))
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

function CommitHandler(msg_tuple){
  // console.log("Received COMMIT " + msg_tuple);
  if(msg_tuple[2]==my_view){
    commit_count++;
    if(commit_count >= 2*f+1 && reply_sent==false){
      if(state=='normal'){
        stopTimer();
      }
      request = null;
      // console.log(`Processing is ${processing}`);
      for(const [key, value] of processing)
      {
        // console.log(key, value, "Are the key and value");
        console.log(key[1], my_view, key[1]==my_view, parseInt(key[1])==parseInt(my_view));
        {
          if(parseInt(key[1])==parseInt(my_view))
            {
              request = (key[0]);
            }
        }
      }
      console.log(`Request is ${request} and unordered is ${unordered}`)
      if(request!=null){
        console.log(`Executing request ${request}`);
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
        executeRequestAndLog(request, json_data);
        remove_index = -1;
        for(i=0; i<unordered.length; i++){
          console.log((unordered[i]), (request), (unordered[i])==(request), (unordered[i])===(request));
          if((unordered[i])==(request)){
            remove_index = i;
            break;
          }
        }
        // console.log(unordered);
        // console.log(request[3])
        if(remove_index!=-1){
          console.log(`Executed Request found at ${remove_index} and removed`);
          // console.log(`Unordered is ${unordered}`);
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

function MergeHandler(msg_tuple){
  if(msg_tuple[2] >= v_last){
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

function PrePrepareMergeHandler(msg_tuple){
  if(isPrePrepared==false && v >= v_last){
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
      reqStateTransfer();
    }
  }
}

function MessageHandler(msg_tuple){
  const msg_type = msg_tuple[0];
    if(msg_type=='STATE-TRANSFER'){
      StateTransferHandler(msg_tuple);
    }

    if(msg_type=='STATE-REPLY'){
      StateReplyHandler(msg_tuple);
    }

    if(msg_type=='REQUEST'){
      RequestHandler(msg_tuple);
    }

    if(msg_type=='PRE-PREPARE'){
      PrePrepareHandler(msg_tuple);
    }

    if(msg_type=='PREPARE'){
      PrepareHandler(msg_tuple);
    }

    if(msg_type=='COMMIT'){
      CommitHandler(msg_tuple);
    }

    if(msg_type=='MERGE'){
      MergeHandler(msg_tuple);
    }
    
    if(msg_tuple=='PRE-PREPARE-MERGE'){
      PrePrepareMergeHandler(msg_tuple);
    }
}

function updateState(serverState){
  my_view = serverState.my_view;
  m_last = serverState.m_last;
  v_last = serverState.v_last;
  unordered = serverState.unordered;
  pending = serverState.pending;
  processing = serverState.processing;
  state = serverState.state;
  isPrepared = serverState.isPrepared;
  isPrePrepared = serverState.isPrePrepared;
  prepared_count = serverState.prepared_count;
  commit_count = serverState.commit_count;
  merge_count = serverState.merge_count;
  prepared_request_digest = serverState.prepared_request_digest;
  commit_sent = serverState.commit_sent;
  reply_sent = serverState.reply_sent;
  blacklist = serverState.blacklist;
  merge_list = serverState.merge_list;
}

function executeCommands(commandsList){
  commandsList.forEach(command => {
    MessageHandler(command);
  })
}



const server = net.createServer(socket => {
  console.log('New connection from ' + socket.remoteAddress + ':' + socket.remotePort);
  connectToPeers();

  // socket.on('data', data => {
  //   buffer += data.toString();
  //   const delimIndex = buffer.indexOf('\0');
  //   if(delimIndex!==-1)
  //   {
  //     data = buffer.substring(0, delimIndex);
  //   }
  //   buffer = '';
  //   console.log('Received data from ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + data.toString());
  //   const msg_tuple = JSON.parse(data);
  //   checkPointBuffer.push(msg_tuple);

  //   MessageHandler(msg_tuple);
  // });

  socket.on('data', data => {
    buffer += data.toString();
    let delimIndex;
    while ((delimIndex = buffer.indexOf('\0')) !== -1) {
        const message = buffer.substring(0, delimIndex);
        buffer = buffer.substring(delimIndex + 1);
        console.log('Received data from ' + socket.remoteAddress + ':' + socket.remotePort + ': ' + message);
        const msg_tuple = JSON.parse(message);
        checkPointBuffer.push(msg_tuple);
        MessageHandler(msg_tuple);
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

readEnvFile();
console.log(peers);
if(my_view==host_id){
  isPrimary=true;
}

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