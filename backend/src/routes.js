import express from "express";
import pool from "./db.js";
import { loadPlayers } from "./playerStore.js";
import { loadTeams } from "./teamStore.js";

const router = express.Router();

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/players", async (_req, res) => {
  const players = await loadPlayers();
  res.json(players);
});

router.get("/teams", async (_req, res) => {
  const teams = await loadTeams();
  res.json(teams);
});

// Sold vs remaining players for a given room (backed by DB)
router.get("/rooms/:roomId/players-status", async (req, res) => {
  const roomCode = req.params.roomId;
  if (!roomCode) {
    return res.status(400).json({ error: "roomId is required" });
  }

  try {
    const [[roomRow]] = await pool.query("SELECT id FROM rooms WHERE room_code = ? LIMIT 1", [roomCode]);
    if (!roomRow) {
      return res.status(404).json({ error: "room not found" });
    }
    const roomDbId = roomRow.id;

    const userIdParam = Number(req.query.userId);
    const [sold] = await pool.query(
      `SELECT c.id, c.name, c.role, c.batting_rating, c.bowling_rating, c.rating, c.base_price, c.country, tp.price
       FROM team_players tp
       JOIN cricketers c ON c.id = tp.player_id
       WHERE tp.room_id = ?
       ORDER BY c.role, c.name`,
      [roomDbId]
    );

    const [remaining] = await pool.query(
      `SELECT c.id, c.name, c.role, c.batting_rating, c.bowling_rating, c.rating, c.base_price, c.country
       FROM cricketers c
       LEFT JOIN (
         SELECT DISTINCT player_id FROM team_players WHERE room_id = ?
       ) sold ON sold.player_id = c.id
       WHERE sold.player_id IS NULL
       ORDER BY c.role, c.name`,
      [roomDbId]
    );

    let userTeam = [];
    let userBudget = null;
    const user = (req.query.user || "").trim();
    const userClause = userIdParam && Number.isInteger(userIdParam)
      ? { sql: "rp.user_id = ?", val: userIdParam }
      : user
        ? { sql: "u.username = ?", val: user }
        : null;

    if (userClause) {
      const [[playerRow]] = await pool.query(
        `SELECT rp.user_id, rp.budget
         FROM room_players rp
         ${userIdParam ? "" : "JOIN users u ON u.id = rp.user_id"}
         WHERE rp.room_id = ? AND ${userClause.sql} LIMIT 1`,
        [roomDbId, userClause.val]
      );
      if (playerRow?.user_id) {
        userBudget = Number(playerRow.budget ?? 100);
        const [teamRows] = await pool.query(
          `SELECT c.id, c.name, c.role, c.batting_rating, c.bowling_rating, c.rating, c.base_price, c.country, tp.price
           FROM team_players tp
           JOIN cricketers c ON c.id = tp.player_id
           WHERE tp.room_id = ? AND tp.user_id = ?
           ORDER BY c.role, c.name`,
          [roomDbId, playerRow.user_id]
        );
        userTeam = teamRows;
      }
    }

    return res.json({
      roomId: roomCode,
      sold,
      remaining,
      userTeam,
      userBudget,
      counts: { sold: sold.length, remaining: remaining.length },
    });
  } catch (err) {
    console.error("Failed to fetch player status", err.message);
    // Fallback to in-memory list so the API still returns data if DB is down
    const fallbackPlayers = await loadPlayers();
    return res.status(200).json({
      roomId,
      sold: [],
      remaining: fallbackPlayers,
      counts: { sold: 0, remaining: fallbackPlayers.length },
      warning: "DB unavailable; returning fallback player list",
    });
  }
});

// Team purses for a room (from DB)
router.get("/rooms/:roomId/purses", async (req, res) => {
  const roomCode = req.params.roomId;
  if (!roomCode) return res.status(400).json({ error: "roomId is required" });
  try {
    const [[roomRow]] = await pool.query("SELECT id FROM rooms WHERE room_code = ? LIMIT 1", [roomCode]);
    if (!roomRow) return res.status(404).json({ error: "room not found" });
    const roomDbId = roomRow.id;
    const [rows] = await pool.query(
      `SELECT u.username, COALESCE(rp.team_name, '') AS teamName, rp.budget
       FROM room_players rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.room_id = ?
       ORDER BY rp.budget DESC, u.username ASC`,
      [roomDbId]
    );
    return res.json({ roomId: roomCode, purses: rows });
  } catch (err) {
    console.error("Failed to fetch purses", err.message);
    return res.status(500).json({ error: "failed to load purses" });
  }
});

export default router;
