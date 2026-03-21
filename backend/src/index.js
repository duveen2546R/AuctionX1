import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { loadPlayers } from "./playerStore.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", process.env.FRONTEND_ORIGIN].filter(Boolean),
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();
let playersMaster = [];

function shuffle(array) {
  return array
    .map((item) => ({ ...item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ sort, ...rest }) => rest);
}

function createRoom(roomId) {
  const shuffledPlayers = shuffle(playersMaster);
  return {
    roomId,
    playersQueue: shuffledPlayers,
    idx: 0,
    users: new Map(),
    currentPlayer: null,
    currentBid: 0,
    highestBidder: null,
    timer: null,
    timeLeft: 0,
    status: "waiting",
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

function broadcastPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.users.values()).map((u) => u.username);
  io.to(roomId).emit("players_update", players);
}

function startTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.timeLeft = 30;
  io.to(roomId).emit("timer", room.timeLeft);

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    io.to(roomId).emit("timer", room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      finalizeBid(roomId);
    }
  }, 1000);
}

function startNextPlayer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  if (room.idx >= room.playersQueue.length) {
    endAuction(roomId);
    return;
  }

  const player = room.playersQueue[room.idx];
  room.idx += 1;
  room.currentPlayer = player;
  room.currentBid = Number(player.base_price) || 0;
  room.highestBidder = null;
  room.status = "running";

  io.to(roomId).emit("new_player", player);
  io.to(roomId).emit("bid_update", { amount: room.currentBid, by: null });
  startTimer(roomId);
}

function finalizeBid(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.currentPlayer) return;

  const winnerId = room.highestBidder;
  if (winnerId && room.users.has(winnerId)) {
    const user = room.users.get(winnerId);
    user.team.push(room.currentPlayer);
    user.score = user.team.reduce((sum, p) => sum + Number(p.rating || 0), 0);

    io.to(roomId).emit("player_won", {
      player: room.currentPlayer,
      winner: user.username,
    });
    io.to(winnerId).emit("player_won", {
      player: room.currentPlayer,
      winner: user.username,
      isYou: true,
    });
  } else {
    io.to(roomId).emit("player_won", {
      player: room.currentPlayer,
      winner: null,
    });
  }

  setTimeout(() => startNextPlayer(roomId), 1500);
}

function endAuction(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = "finished";
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  const scores = Array.from(room.users.entries()).map(([socketId, user]) => ({
    socketId,
    username: user.username,
    score: user.score || 0,
    players: user.team.length,
  }));
  const winnerEntry = scores.sort((a, b) => b.score - a.score)[0] || null;
  const winnerName = winnerEntry?.username || "No winner";

  io.to(roomId).emit("auction_complete", { winner: winnerName, scores });
}

function handleBid(socket, amount) {
  const roomId = socket.data.roomId;
  const room = rooms.get(roomId);
  if (!room || !room.currentPlayer) return;

  const numericBid = Number(amount);
  const minRaise = 1;
  if (Number.isNaN(numericBid) || numericBid < room.currentBid + minRaise) return;

  room.currentBid = numericBid;
  room.highestBidder = socket.id;

  io.to(roomId).emit("bid_update", {
    amount: room.currentBid,
    by: socket.data.username,
  });
}

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId, username }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    const cleanName = (username || "").trim() || `Player-${socket.id.slice(-4)}`;
    socket.data.roomId = roomId;
    socket.data.username = cleanName;

    room.users.set(socket.id, { username: cleanName, team: [], score: 0 });
    socket.join(roomId);
    broadcastPlayers(roomId);
  });

  socket.on("start_auction", (roomId) => {
    const resolvedRoom = roomId || socket.data.roomId;
    const room = getRoom(resolvedRoom);
    if (room.status === "running") return;
    startNextPlayer(resolvedRoom);
  });

  socket.on("place_bid", (amount) => handleBid(socket, amount));

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.users.delete(socket.id);
    broadcastPlayers(roomId);
  });
});

async function bootstrap() {
  playersMaster = await loadPlayers();
  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    console.log(`Auction server listening on ${port}`);
  });
}

bootstrap();
