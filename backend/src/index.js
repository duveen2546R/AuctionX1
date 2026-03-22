import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import pool from "./db.js";
import { loadPlayers } from "./playerStore.js";
import { loadTeams } from "./teamStore.js";
import apiRouter from "./routes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(apiRouter);

app.get("/teams", async (_req, res) => {
  const teams = await loadTeams();
  res.json(teams);
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
let teamsMaster = [];

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
    dbId: null,
    playersQueue: shuffledPlayers,
    idx: 0,
    users: new Map(),
    currentPlayer: null,
    currentBid: 0,
    highestBidder: null,
    timer: null,
    timeLeft: 0,
    status: "waiting",
    lastBidAt: Date.now(),
    warnedOnce: false,
    warnedTwice: false,
    passedUsers: new Set(),
    blockedUsers: new Set(),
    playing11: new Map(),
    disqualified: new Set(),
  };
}

function activeSockets(room) {
  return Array.from(room.users.keys()).filter((id) => !room.blockedUsers.has(id));
}

function getRoom(roomId, dbId = null) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  const room = rooms.get(roomId);
  if (dbId && !room.dbId) {
    room.dbId = dbId;
  }
  return room;
}

function broadcastPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.users.values()).map((u) => ({
    username: u.username,
    team: u.teamName || null,
  }));
  io.to(roomId).emit("players_update", players);
}

function startTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastBidAt = Date.now();
  room.warnedOnce = false;
  room.warnedTwice = false;

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(async () => {
    const idleMs = Date.now() - (room.lastBidAt || 0);
    if (!room.warnedOnce && idleMs >= 7000) {
      room.warnedOnce = true;
      io.to(roomId).emit("bid_warning", { stage: "once", by: room.users.get(room.highestBidder || "")?.username || "No bids" });
    } else if (room.warnedOnce && !room.warnedTwice && idleMs >= 10000) {
      room.warnedTwice = true;
      io.to(roomId).emit("bid_warning", { stage: "twice", by: room.users.get(room.highestBidder || "")?.username || "No bids" });
    } else if (room.warnedTwice && idleMs >= 13000) {
      clearInterval(room.timer);
      room.timer = null;
      await finalizeBid(roomId);
      return;
    }
  }, 1000);
}

function maybeAutoResolve(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.currentPlayer) return;
  const active = activeSockets(room);
  if (active.length === 0) {
    endAuction(roomId);
    return;
  }
  if (active.length === 1) {
    if (!room.highestBidder) {
      room.highestBidder = active[0];
      room.currentBid = Number(room.currentPlayer.base_price) || 0;
      const by = room.users.get(active[0])?.username;
      room.bidHistory.push({ amount: room.currentBid, by, ts: Date.now(), note: "auto-win (only bidder)" });
      io.to(roomId).emit("bid_update", {
        amount: room.currentBid,
        by,
        history: room.bidHistory.slice(-10),
      });
    }
    finalizeBid(roomId);
  } else if (active.length === 0) {
    finalizeBid(roomId);
  }
}

function emitQueueUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const remaining = room.playersQueue.length - room.idx;
  const completed = room.idx - 1;
  const next = room.playersQueue.slice(room.idx, room.idx + 3);
  io.to(roomId).emit("queue_update", { remaining, completed, next });
}

function evaluatePlaying11(room, socketId, playerIds) {
  const user = room.users.get(socketId);
  if (!user) return { ok: false, reason: "user missing" };
  if (playerIds.length !== 11) return { ok: false, reason: "Must pick exactly 11 players" };

  const owned = new Map(user.team.map((p) => [p.id, p]));
  const lineup = [];
  for (const id of playerIds) {
    if (!owned.has(id)) return { ok: false, reason: "Contains player you do not own" };
    lineup.push(owned.get(id));
  }

  let bats = 0, bowls = 0, wks = 0, ars = 0, overseas = 0;
  let battingTotal = 0, bowlingTotal = 0;
  lineup.forEach((p) => {
    const role = (p.role || "").toLowerCase();
    const batR = Number(p.batting_rating ?? p.rating ?? 0);
    const bowlR = Number(p.bowling_rating ?? p.rating ?? 0);
    const isOverseas = (p.country || "").toLowerCase() !== "india";
    if (isOverseas) overseas += 1;

    const isAr = role.includes("all");
    const isBat = role.includes("bat");
    const isBowl = role.includes("bowl");
    const isWk = role.includes("keep");

    if (isAr) {
      ars += 1;
      bats += 1;
      bowls += 1;
      battingTotal += batR;
      bowlingTotal += bowlR;
    } else {
      if (isBat) { bats += 1; battingTotal += batR; }
      if (isBowl) { bowls += 1; bowlingTotal += bowlR; }
      if (isWk) { wks += 1; battingTotal += batR; }
    }
  });

  if (bats < 3) return { ok: false, reason: "Need at least 3 batsmen" };
  if (bowls < 3) return { ok: false, reason: "Need at least 3 bowlers" };
  if (wks < 1) return { ok: false, reason: "Need at least 1 wicketkeeper" };
  if (ars < 1 || ars > 3) return { ok: false, reason: "Need 1–3 all-rounders" };
  if (overseas > 4) return { ok: false, reason: "Max 4 overseas players" };

  const balanceBonus = 100;
  const score = battingTotal * 0.45 + bowlingTotal * 0.45 + balanceBonus * 0.1;

  return {
    ok: true,
    score,
    breakdown: { battingTotal, bowlingTotal, balanceBonus, bats, bowls, wks, ars },
  };
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
  room.lastBidAt = Date.now();
  room.warnedOnce = false;
  room.warnedTwice = false;
  room.passedUsers = new Set();
  // keep blockedUsers across players
  room.bidHistory = [];

  if (room.dbId) {
    pool
      .query("UPDATE rooms SET status = 'ongoing' WHERE id = ?", [room.dbId])
      .catch((err) => console.error("Failed to mark room ongoing", err.message));
  }

  io.to(roomId).emit("new_player", player);
  io.to(roomId).emit("bid_update", { amount: room.currentBid, by: null, history: room.bidHistory || [] });
  emitQueueUpdate(roomId);
  startTimer(roomId);
  maybeAutoResolve(roomId);
}

async function finalizeBid(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.currentPlayer) return;

  const winnerId = room.highestBidder;
  if (winnerId && room.users.has(winnerId)) {
    const user = room.users.get(winnerId);
    user.team.push(room.currentPlayer);
    user.score = user.team.reduce((sum, p) => sum + Number(p.rating || 0), 0);
    user.budget = Math.max(0, (user.budget ?? 100) - Number(room.currentBid || 0));

    if (room.dbId && user.userId) {
      try {
        await pool.query(
          "INSERT INTO team_players (room_id, user_id, player_id, price) VALUES (?, ?, ?, ?)",
          [room.dbId, user.userId, room.currentPlayer.id, room.currentBid]
        );
        await pool.query(
          "UPDATE room_players SET budget = ? WHERE room_id = ? AND user_id = ?",
          [user.budget, room.dbId, user.userId]
        );
      } catch (err) {
        console.error("Failed to persist team winner", err.message);
      }
    }
    io.to(winnerId).emit("budget_update", { budget: user.budget });

    io.to(roomId).emit("player_won", {
      player: room.currentPlayer,
      winner: user.username,
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
  if (!room || room.status === "picking") return;
  room.status = "picking";
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
  io.to(roomId).emit("auction_complete", { stage: "select11", scores });

  if (room.dbId) {
    pool
      .query("UPDATE rooms SET status = 'finished' WHERE id = ?", [room.dbId])
      .catch((err) => console.error("Failed to mark room finished", err.message));
  }

  // determine eligibility
  const disqualified = new Set(room.disqualified);
  const userEntries = Array.from(room.users.entries());
  userEntries.forEach(([sid, user]) => {
    const roster = user.team || [];
    const total = roster.length;
    const bats = roster.filter((p) => p.role?.includes("bat")).length;
    const bowls = roster.filter((p) => p.role?.includes("bowl")).length;
    const wks = roster.filter((p) => p.role?.includes("keep")).length;
    const ars = roster.filter((p) => p.role?.includes("all")).length;
    const overseas = roster.filter((p) => (p.country || "").toLowerCase() !== "india").length;
    const locals = total - overseas;

    const feasible =
      total >= 11 &&
      (bats + ars) >= 4 &&
      (bowls + ars) >= 3 &&
      wks >= 1 &&
      ars >= 1 &&
      locals >= 7; // to satisfy max 4 overseas

    if (!feasible) disqualified.add(sid);
  });
  room.disqualified = disqualified;
  const dqNames = Array.from(disqualified).map((sid) => room.users.get(sid)?.username).filter(Boolean);

  room.selectDeadline = Date.now() + 2 * 60 * 1000; // 2 minutes
  setTimeout(() => autoFinalizePlaying11(roomId), 2 * 60 * 1000 + 500);

  io.to(roomId).emit("auction_complete", {
    stage: "select11",
    scores,
    disqualified: dqNames,
    deadline: room.selectDeadline,
  });
}

function buildAutoLineup(team) {
  const lineup = [];
  const bats = team.filter((p) => (p.role || "").toLowerCase().includes("bat") && !(p.role || "").toLowerCase().includes("all"));
  const bowls = team.filter((p) => (p.role || "").toLowerCase().includes("bowl") && !(p.role || "").toLowerCase().includes("all"));
  const wks = team.filter((p) => (p.role || "").toLowerCase().includes("keep"));
  const ars = team.filter((p) => (p.role || "").toLowerCase().includes("all"));

  const byScore = (arr) =>
    arr.slice().sort((a, b) => (Number(b.batting_rating ?? b.rating ?? 0) + Number(b.bowling_rating ?? b.rating ?? 0)) -
      (Number(a.batting_rating ?? a.rating ?? 0) + Number(a.bowling_rating ?? a.rating ?? 0)));

  const overseas = (p) => (p.country || "").toLowerCase() !== "india";
  const pushWithCap = (p) => {
    const osCount = lineup.filter(overseas).length;
    if (overseas(p) && osCount >= 4) return false;
    lineup.push(p);
    return true;
  };

  // 1 wk
  for (const p of byScore(wks)) { if (pushWithCap(p)) break; }
  if (!lineup.some((p) => (p.role || "").toLowerCase().includes("keep"))) return null;

  // 1-3 AR
  for (const p of byScore(ars)) {
    if (lineup.filter((x) => (x.role || "").toLowerCase().includes("all")).length >= 3) break;
    pushWithCap(p);
  }
  if (lineup.filter((x) => (x.role || "").toLowerCase().includes("all")).length < 1) return null;

  // Fill bats to 4
  for (const p of byScore(bats)) {
    if (lineup.length >= 11) break;
    const batCount = lineup.filter((x) => (x.role || "").toLowerCase().includes("bat") || (x.role || "").toLowerCase().includes("all")).length;
    if (batCount >= 4) break;
    pushWithCap(p);
  }

  // Fill bowls to 3
  for (const p of byScore(bowls)) {
    if (lineup.length >= 11) break;
    const bowlCount = lineup.filter((x) => (x.role || "").toLowerCase().includes("bowl") || (x.role || "").toLowerCase().includes("all")).length;
    if (bowlCount >= 3) break;
    pushWithCap(p);
  }

  // Fill remaining best overall
  const remaining = byScore(team.filter((p) => !lineup.includes(p)));
  for (const p of remaining) {
    if (lineup.length >= 11) break;
    pushWithCap(p);
  }

  if (lineup.length !== 11) return null;
  const val = evaluatePlaying11({ users: new Map([["tmp", { team: lineup }]]) }, "tmp", lineup.map((p) => p.id));
  if (!val.ok) return null;
  return lineup;
}

async function autoFinalizePlaying11(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== "picking") return;
  const active = activeSockets(room);
  const disqualified = room.disqualified || new Set();

  for (const sid of active) {
    if (disqualified.has(sid)) continue;
    if (room.playing11.has(sid)) continue;
    const user = room.users.get(sid);
    const lineup = buildAutoLineup(user.team || []);
    if (lineup) {
      const evalResult = evaluatePlaying11(room, sid, lineup.map((p) => p.id));
      if (evalResult.ok) {
        room.playing11.set(sid, { ...evalResult, playerIds: lineup.map((p) => p.id), username: user.username });
        if (room.dbId && user.userId) {
          pool
            .query(
              "INSERT INTO playing11 (room_id, user_id, player_ids, score) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE player_ids = VALUES(player_ids), score = VALUES(score)",
              [room.dbId, user.userId, JSON.stringify(lineup.map((p) => p.id)), evalResult.score]
            )
            .catch((err) => console.error("Failed to persist playing11", err.message));
        }
      } else {
        disqualified.add(sid);
      }
    } else {
      disqualified.add(sid);
    }
  }

  room.disqualified = disqualified;
  if (room.playing11.size + disqualified.size >= active.length) {
    const results = Array.from(room.playing11.values()).sort((a, b) => b.score - a.score);
    const winnerName = results[0]?.username || "No winner";
    const dqNames = Array.from(disqualified).map((sid) => room.users.get(sid)?.username).filter(Boolean);
    io.to(roomId).emit("playing11_results", { winner: winnerName, results, disqualified: dqNames });
    room.status = "finished_finalized";
  }
}

function handleBid(socket, amount) {
  const roomId = socket.data.roomId;
  const room = rooms.get(roomId);
  if (!room || !room.currentPlayer) return;
  if (room.blockedUsers.has(socket.id)) return;
  if (room.passedUsers.has(socket.id)) return;
  if (room.highestBidder === socket.id) return; // prevent consecutive self-bids

  const numericBid = Number(amount);
  const step =
    room.currentBid < 12 ? 0.1 :
    room.currentBid < 20 ? 0.25 :
    0.5;
  if (Number.isNaN(numericBid) || numericBid < room.currentBid + step - 1e-9) return;

  const user = room.users.get(socket.id);
  if (user && numericBid > (user.budget ?? 100)) {
    return;
  }

  room.currentBid = numericBid;
  room.highestBidder = socket.id;
  room.lastBidAt = Date.now();
  room.warnedOnce = false;
  room.warnedTwice = false;
  room.passedUsers = new Set();
  room.bidHistory.push({
    amount: room.currentBid,
    by: socket.data.username,
    ts: Date.now(),
  });

  io.to(roomId).emit("bid_update", {
    amount: room.currentBid,
    by: socket.data.username,
    history: room.bidHistory.slice(-10),
    step:
      room.currentBid < 12 ? 0.1 :
      room.currentBid < 20 ? 0.25 :
      0.5,
  });
  maybeAutoResolve(roomId);

  if (room.dbId && user?.userId && room.currentPlayer?.id) {
    pool
      .query(
        "INSERT INTO bids (room_id, player_id, user_id, bid_amount) VALUES (?, ?, ?, ?)",
        [room.dbId, room.currentPlayer.id, user.userId, numericBid]
      )
      .catch((err) => console.error("Failed to persist bid", err.message));
  }
}

io.on("connection", (socket) => {
  socket.on("join_room", async ({ roomId, username, teamName }) => {
    if (!roomId) return;
    const cleanName = (username || "").trim() || `Player-${socket.id.slice(-4)}`;
    const cleanTeam = (teamName || "").trim() || null;
    socket.data.roomId = roomId;
    socket.data.username = cleanName;

    let userId = null;
    let roomDbId = null;
    let budget = 100;
    let teamId = null;
    try {
      const [users] = await pool.query("SELECT id FROM users WHERE username = ? LIMIT 1", [cleanName]);
      if (users.length) {
        userId = users[0].id;
      } else {
        const [insert] = await pool.query("INSERT INTO users (username) VALUES (?)", [cleanName]);
        userId = insert.insertId;
      }

      const [insertRoom] = await pool.query(
        "INSERT INTO rooms (room_code, host_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
        [roomId, userId]
      );
      roomDbId = insertRoom.insertId;

      if (cleanTeam) {
        const [teamRow] = await pool.query("SELECT id FROM teams WHERE name = ? LIMIT 1", [cleanTeam]);
        if (teamRow.length) {
          teamId = teamRow[0].id;
        }
      }

      await pool.query(
        "INSERT INTO room_players (room_id, user_id, team_name, team_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), team_id = VALUES(team_id)",
        [roomDbId, userId, cleanTeam, teamId]
      );
      const [playerRow] = await pool.query(
        "SELECT budget FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1",
        [roomDbId, userId]
      );
      if (playerRow.length) {
        budget = Number(playerRow[0].budget ?? 100);
      }
    } catch (err) {
      console.error("DB error on join_room", err.message);
    }

    const room = getRoom(roomId, roomDbId);
    if (cleanTeam) {
      const taken = Array.from(room.users.values()).some((u) => u.teamName === cleanTeam);
      if (taken) {
        socket.emit("team_taken", { team: cleanTeam });
        return;
      }
    }
    room.users.set(socket.id, { username: cleanName, team: [], score: 0, budget, userId, teamName: cleanTeam });
    socket.join(roomId);
    broadcastPlayers(roomId);
    socket.emit("bid_update", { amount: room.currentBid, by: null, history: room.bidHistory || [] });
    socket.emit("budget_update", { budget });
  });

  socket.on("start_auction", (roomId) => {
    const resolvedRoom = roomId || socket.data.roomId;
    const room = getRoom(resolvedRoom);
    if (room.status === "running") return;
    io.to(resolvedRoom).emit("start_auction");
    setTimeout(() => startNextPlayer(resolvedRoom), 800);
  });

  socket.on("place_bid", (amount) => handleBid(socket, amount));

  socket.on("withdraw_bid", async () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.blockedUsers.add(socket.id);

    if (room.currentPlayer && room.highestBidder === socket.id) {
      room.bidHistory.push({
        amount: room.currentBid,
        by: socket.data.username,
        ts: Date.now(),
        note: "withdraw (forced sale)",
      });
      await finalizeBid(roomId); // immediate sale to withdrawing highest bidder
    }

    if (activeSockets(room).length === 0) {
      endAuction(roomId);
    }
  });

  socket.on("pass_player", async () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.currentPlayer) return;
    room.passedUsers.add(socket.id);
    room.bidHistory.push({
      amount: room.currentBid,
      by: socket.data.username,
      ts: Date.now(),
      note: "pass",
    });

    if (room.highestBidder === socket.id) {
      room.highestBidder = null;
      room.currentBid = Number(room.currentPlayer.base_price) || 0;
      room.lastBidAt = Date.now();
      room.warnedOnce = false;
      room.warnedTwice = false;
      io.to(roomId).emit("bid_update", { amount: room.currentBid, by: null, history: room.bidHistory.slice(-10) });
    }

    const totalPlayers = room.users.size;
    if (totalPlayers > 0 && room.passedUsers.size >= totalPlayers) {
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }
      await finalizeBid(roomId);
    }
    maybeAutoResolve(roomId);
    if (activeSockets(room).length === 0) {
      endAuction(roomId);
    }
  });

  socket.on("chat_message", ({ roomId, text }) => {
    const msg = (text || "").trim();
    if (!msg) return;
    const resolvedRoom = roomId || socket.data.roomId;
    if (!resolvedRoom) return;
    io.to(resolvedRoom).emit("chat_message", {
      user: socket.data.username,
      text: msg,
      ts: Date.now(),
    });
  });

  socket.on("submit_playing11", (payload) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.selectDeadline && Date.now() > room.selectDeadline) return;
    if (room.disqualified.has(socket.id)) {
      socket.emit("playing11_error", { reason: "Disqualified: insufficient squad to form valid XI" });
      return;
    }
    const ids = Array.isArray(payload?.playerIds) ? payload.playerIds.map(Number) : [];
    const evalResult = evaluatePlaying11(room, socket.id, ids);
    if (!evalResult.ok) {
      socket.emit("playing11_error", { reason: evalResult.reason });
      return;
    }
    room.playing11.set(socket.id, { ...evalResult, playerIds: ids, username: socket.data.username });

    if (room.dbId && room.users.get(socket.id)?.userId) {
      const uid = room.users.get(socket.id).userId;
      pool
        .query(
          "INSERT INTO playing11 (room_id, user_id, player_ids, score) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE player_ids = VALUES(player_ids), score = VALUES(score)",
          [room.dbId, uid, JSON.stringify(ids), evalResult.score]
        )
        .catch((err) => console.error("Failed to persist playing11", err.message));
    }

    const active = activeSockets(room);
    const submissions = room.playing11.size;
    if (submissions >= active.length) {
      const results = Array.from(room.playing11.values()).sort((a, b) => b.score - a.score);
      const winnerName = results[0]?.username || "No winner";
      io.to(roomId).emit("playing11_results", { winner: winnerName, results });
    } else {
      socket.emit("playing11_ack", { ok: true, pending: active.length - submissions });
    }
  });

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
  teamsMaster = await loadTeams();
  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    console.log(`Auction server listening on ${port}`);
  });
}

bootstrap();
