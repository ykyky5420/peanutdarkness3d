// server.js - 세상을 관장하는 절대적인 심장
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const firebase = require('firebase'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const firebaseConfig = {
  apiKey: "AIzaSyDIE7bjCnWPGOiPgS624wNqCaUqUej5h0E",
  authDomain: "peanut-darkn.firebaseapp.com",
  databaseURL: "https://peanut-darkn-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "peanut-darkn",
  storageBucket: "peanut-darkn.firebasestorage.app",
  messagingSenderId: "348191691111",
  appId: "1:348191691111:web:11a13b541010f00dbddfc2",
  measurementId: "G-QHW5Q5L9TW"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const MAP_RADIUS = 4000;
const MAP_CENTER = 4000;
const PLAYER_COLORS = ["#FFD700", "#00FFFF", "#ADFF2F", "#FF69B4", "#FFA500", "#87CEEB", "#F0E68C", "#E6E6FA"];

let wordBank = ["진실"]; 
db.ref('wordBank').once('value', (snap) => {
    let words = snap.val();
    if (words) {
        wordBank = Object.keys(words);
    } else {
        wordBank = ["진실", "절망", "희망", "기억", "용기", "연대"];
        wordBank.forEach(w => db.ref('wordBank/' + w).set(true));
    }
    console.log(`[서버 준비 완료] 거대한 우물에 ${wordBank.length}개의 진실이 담겨 있습니다.`);
});

const rooms = {};

function createRoom(roomId) {
    let newWorld = {
        angle: 0,
        targetWord: wordBank.length > 0 ? wordBank[Math.floor(Math.random() * wordBank.length)] : "진실",
        players: {},
        items: [],
        enemies: [],
        footprints: [],
        meteors: [], // 찰나의 구원
        fItems: [],  // 운석이 남긴 형광물질
        fMarks: [],  // 탐험가가 새긴 영구적인 빛
        lastMeteorTime: Date.now(),
        serverTime: Date.now(),
        gameStartTime: Date.now() // 진실을 향한 여정의 시작
    };

    for(let i=0; i<15; i++) {
        let r = Math.random() * (MAP_RADIUS - 500) + 500;
        let a = Math.random() * Math.PI * 2;
        newWorld.items.push({ x: MAP_CENTER + r*Math.cos(a), y: MAP_CENTER + r*Math.sin(a), active: true });
    }
    for (let r = 800; r < MAP_RADIUS - 200; r += 600) {
        let numEnemies = Math.floor((Math.PI * 2) * r / 1800); 
        for (let i = 0; i < numEnemies; i++) {
           let a = ((Math.PI * 2) / numEnemies) * i + (Math.random() * 0.4 - 0.2); 
           newWorld.enemies.push({
             x: MAP_CENTER + r*Math.cos(a), y: MAP_CENTER + r*Math.sin(a), 
             type: Math.random() < 0.5 ? 'red' : 'blue',
             active: true, wanderAngle: Math.random() * Math.PI * 2
           });
        }
    }
    rooms[roomId] = newWorld;
    console.log(`[차원 생성] 새로운 방이 열렸습니다: ${roomId}`);
}

io.on('connection', (socket) => {
    socket.emit('wordBankUpdate', wordBank);

    socket.on('join', (data) => {
        let roomId = data.room;
        socket.join(roomId);
        socket.roomId = roomId; 

        if (!rooms[roomId]) createRoom(roomId);
        let world = rooms[roomId];

        world.players[socket.id] = { 
            name: data.name, 
            x: MAP_CENTER, 
            y: MAP_CENTER + MAP_RADIUS - 80, 
            dir: -Math.PI/2, 
            lantern: true, 
            fCount: 0, 
            color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] 
        };
        io.to(roomId).emit('systemMessage', { text: data.name + ' 님이 어둠 속에 발을 들였습니다.' });
    });

    socket.on('move', (data) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            let p = rooms[roomId].players[socket.id];
            p.x = data.x; p.y = data.y; p.dir = data.dir; p.lantern = data.lantern;
        }
    });

    socket.on('footprint', (data) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId].footprints.push({ x: data.x, y: data.y, angle: data.angle, time: Date.now() });
        }
    });

    socket.on('collectItem', (index) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            let world = rooms[roomId];
            if (world.items[index] && world.items[index].active) {
                world.items[index].active = false;
                socket.emit('itemCollected'); 
            }
        }
    });

    // 형광물질 수집 섭리
    socket.on('collectFItem', (id) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            let world = rooms[roomId];
            let itemIdx = world.fItems.findIndex(f => f.id === id);
            if (itemIdx !== -1) {
                world.fItems.splice(itemIdx, 1);
                if (world.players[socket.id]) {
                    world.players[socket.id].fCount = (world.players[socket.id].fCount || 0) + 1;
                }
            }
        }
    });

    // 채팅 메시지 전송
    socket.on('sendChat', (msg) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            let p = rooms[roomId].players[socket.id];
            io.to(roomId).emit('receiveChat', { sender: p.name, text: msg, color: p.color });
        }
    });

    // 형광물질 사용 섭리
    socket.on('useFluorescent', (data) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            let p = rooms[roomId].players[socket.id];
            if (p.fCount > 0) {
                p.fCount--;
                rooms[roomId].fMarks.push({ x: data.x, y: data.y });
                io.to(roomId).emit('systemMessage', { text: `✨ ${p.name}님이 진실의 조각 위에 지워지지 않는 형광물질을 발랐습니다!` });
            }
        }
    });

    socket.on('addWord', (word) => { 
        if (!wordBank.includes(word)) { 
            wordBank.push(word); db.ref('wordBank/' + word).set(true); 
            io.emit('wordBankUpdate', wordBank); 
        } 
    });
    
    socket.on('deleteWord', (word) => { 
        wordBank = wordBank.filter(w => w !== word); db.ref('wordBank/' + word).remove(); 
        io.emit('wordBankUpdate', wordBank); 
    });
    
    socket.on('forceWord', (word) => { 
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId].targetWord = word; 
            rooms[roomId].gameStartTime = Date.now(); // 강제 출제 시 타이머 초기화
            io.to(roomId).emit('worldUpdate', rooms[roomId]); 
        }
    });

    // 정답 제출 및 최고 기록 판별 섭리
    socket.on('submitAnswer', (answer) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            let world = rooms[roomId];
            if (answer.trim() === world.targetWord) {
                let winner = world.players[socket.id] ? world.players[socket.id].name : '누군가';
                let endTime = Date.now();
                let timeTaken = ((endTime - world.gameStartTime) / 1000).toFixed(2);

                // 파이어베이스에서 이 단어의 기존 기록을 불러옵니다.
                db.ref('records/' + world.targetWord).once('value', (snap) => {
                    let record = snap.val();
                    let isNewRecord = false;

                    if (!record || parseFloat(timeTaken) < record.time) {
                        isNewRecord = true;
                        record = { time: parseFloat(timeTaken), name: winner };
                        db.ref('records/' + world.targetWord).set(record);
                    }

                    // 모두에게 승전보를 울립니다.
                    io.to(roomId).emit('gameEnd', { 
                        winner: winner, 
                        word: world.targetWord, 
                        time: timeTaken,
                        bestRecord: record,
                        isNewRecord: isNewRecord
                    });
                    
                    // 탐험가들이 진실의 제단(결과창)을 여유롭게 바라볼 수 있도록 10초 후 세상을 닫습니다.
                    setTimeout(() => {
                        delete rooms[roomId];
                    }, 10000);
                });
            } else {
                socket.emit('systemMessage', { text: '틀렸습니다. 어둠 속을 더 깊이 관찰하세요.' });
            }
        }
    });

    socket.on('disconnect', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            let pName = rooms[roomId].players[socket.id] ? rooms[roomId].players[socket.id].name : '누군가';
            io.to(roomId).emit('systemMessage', { text: pName + ' 님의 빛이 스러졌습니다.' });
            delete rooms[roomId].players[socket.id];
            if (Object.keys(rooms[roomId].players).length === 0) delete rooms[roomId];
        }
    });
});

setInterval(() => {
    let now = Date.now();
    for (let roomId in rooms) {
        let world = rooms[roomId];
        world.angle += 0.002;
        world.serverTime = now;
        
        // 8초 간격 - 광활한 맵 전체 무작위 운석 투하
        if (now - world.lastMeteorTime > 8000) { 
            world.lastMeteorTime = now; 
            let count = Math.floor(Math.random() * 2) + 1;
            
            for(let i=0; i<count; i++) {
                let r = Math.random() * MAP_RADIUS;
                let a = Math.random() * Math.PI * 2;
                let tx = MAP_CENTER + r * Math.cos(a);
                let ty = MAP_CENTER + r * Math.sin(a);

                world.meteors.push({ x: tx, y: ty, startTime: now, duration: 4000 });
                // 운석이 떨어진 자리에 형광물질 아이템(fItem) 생성
                world.fItems.push({ id: Math.random().toString(36).substr(2,9), x: tx, y: ty, active: true });
            }
            io.to(roomId).emit('systemMessage', { text: '🌠 하늘에서 별의 조각이 떨어졌습니다! 미니맵을 확인하세요.' });
        }
        
        world.meteors = world.meteors.filter(m => now - m.startTime < m.duration); 
        world.footprints = world.footprints.filter(fp => now - fp.time < 12000);

        for (let e of world.enemies) {
            if (!e.active) continue;
            let closestP = null; let minDist = Infinity;
            for (let id in world.players) {
                let p = world.players[id];
                let d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d < minDist) { minDist = d; closestP = p; }
            }

            let inLight = false;
            if (closestP) {
                if (minDist < 55) inLight = true;
                else if (closestP.lantern && minDist < 900) {
                    let angleToE = Math.atan2(e.y - closestP.y, e.x - closestP.x);
                    let angleDiff = Math.abs(angleToE - closestP.dir);
                    if (angleDiff > Math.PI) angleDiff = (Math.PI * 2) - angleDiff;
                    if (angleDiff <= (Math.PI / 8.8) / 2) inLight = true;
                }
            }
            e.inLight = inLight;

            if (e.type === 'red' && inLight && closestP) {
                let a = Math.atan2(closestP.y - e.y, closestP.x - e.x);
                e.x += Math.cos(a) * 4.5; e.y += Math.sin(a) * 4.5; e.wanderAngle = a;
            } else if (e.type === 'blue') {
                let tracking = false; let targetFP = null; let closestDist = 300;
                for (let fp of world.footprints) {
                    let dFp = Math.hypot(e.x - fp.x, e.y - fp.y);
                    if (dFp < closestDist) { closestDist = dFp; targetFP = fp; tracking = true; }
                }
                if (tracking && targetFP) {
                    let a = Math.atan2(targetFP.y - e.y, targetFP.x - e.x);
                    e.x += Math.cos(a) * 4.5; e.y += Math.sin(a) * 4.5; e.wanderAngle = a;
                    if (Math.hypot(e.x - targetFP.x, e.y - targetFP.y) < 15) {
                        world.footprints = world.footprints.filter(fp => fp !== targetFP);
                    }
                } else {
                    if (Math.random() < 0.02) e.wanderAngle += (Math.random() - 0.5) * Math.PI;
                    e.x += Math.cos(e.wanderAngle) * 1.5; e.y += Math.sin(e.wanderAngle) * 1.5;
                }
            }

            if (Math.hypot(e.x - MAP_CENTER, e.y - MAP_CENTER) > MAP_RADIUS) {
                let a = Math.atan2(e.y - MAP_CENTER, e.x - MAP_CENTER);
                e.x = MAP_CENTER + Math.cos(a + Math.PI) * (MAP_RADIUS - 15);
                e.y = MAP_CENTER + Math.sin(a + Math.PI) * (MAP_RADIUS - 15);
            }
        }
        io.to(roomId).emit('worldUpdate', world);
    }
}, 1000 / 30);

server.listen(3000, () => {
    console.log("심연의 문이 열렸습니다. http://localhost:3000 으로 접속하세요.");
});