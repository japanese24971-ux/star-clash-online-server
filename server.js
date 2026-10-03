const http=require('http');
const {WebSocketServer,WebSocket}=require('ws');
const PORT=process.env.PORT||8080;
const rooms=new Map();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(){
  let s='';
  for(let i=0;i<6;i++)s+=alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}

function send(ws,obj){
  if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));
}

function makeRoomCode(){
  let c;
  do{c=code()}while(rooms.has(c));
  return c;
}

function cleanup(ws){
  const c=ws.roomCode;
  if(!c)return;
  const r=rooms.get(c);
  if(!r)return;
  const peer=ws===r.host?r.guest:r.host;
  send(peer,{type:'peer_left'});
  rooms.delete(c);
}

const server=http.createServer((req,res)=>{
  res.writeHead(200,{
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*'
  });
  res.end(JSON.stringify({
    ok:true,
    service:'STAR CLASH Online Update 1',
    rooms:rooms.size
  }));
});

const wss=new WebSocketServer({
  server,
  maxPayload:1024*1024
});

wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let m;
    try{
      m=JSON.parse(raw.toString());
    }catch{
      return;
    }

    if(m.type==='create'){
      cleanup(ws);
      const c=makeRoomCode();

      rooms.set(c,{
        host:ws,
        guest:null,
        hostHero:m.hero||'PIXEL',
        guestHero:'PIXEL',
        eventId:m.eventId||'stadium_ball',
        createdAt:Date.now()
      });

      ws.roomCode=c;
      ws.role='host';

      send(ws,{
        type:'room_created',
        code:c
      });

      return;
    }

    if(m.type==='join'){
      const c=String(m.code||'').toUpperCase();
      const r=rooms.get(c);

      if(!r){
        send(ws,{
          type:'error',
          message:'Room not found'
        });
        return;
      }

      if(r.guest){
        send(ws,{
          type:'error',
          message:'Room is full'
        });
        return;
      }

      cleanup(ws);

      r.guest=ws;
      r.guestHero=m.hero||'PIXEL';

      ws.roomCode=c;
      ws.role='guest';

      send(ws,{
        type:'room_joined',
        code:c
      });

      send(r.host,{
        type:'room_ready',
        role:'host',
        code:c,
        hostHero:r.hostHero,
        guestHero:r.guestHero,
        eventId:r.eventId
      });

      send(r.guest,{
        type:'room_ready',
        role:'guest',
        code:c,
        hostHero:r.hostHero,
        guestHero:r.guestHero,
        eventId:r.eventId
      });

      return;
    }

    const c=ws.roomCode||String(m.code||'').toUpperCase();
    const r=rooms.get(c);

    if(!r)return;

    if(m.type==='guest_input'&&ws===r.guest){
      send(r.host,{
        type:'guest_input',
        input:m.input||{},
        actions:Array.isArray(m.actions)?m.actions.slice(0,12):[]
      });
      return;
    }

    if(m.type==='snapshot'&&ws===r.host){
      send(r.guest,{
        type:'snapshot',
        state:m.state
      });
      return;
    }

    if(m.type==='leave'){
      cleanup(ws);
      return;
    }
  });

  ws.on('close',()=>cleanup(ws));
  ws.on('error',()=>cleanup(ws));
});

setInterval(()=>{
  const now=Date.now();

  for(const [c,r] of rooms){
    if(now-r.createdAt>6*60*60*1000){
      send(r.host,{
        type:'error',
        message:'Room expired'
      });

      send(r.guest,{
        type:'error',
        message:'Room expired'
      });

      rooms.delete(c);
    }
  }
},60000).unref();

server.listen(PORT,()=>{
  console.log(`STAR CLASH online server listening on ${PORT}`);
});
