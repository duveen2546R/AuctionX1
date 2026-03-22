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
  const roomId = Number(req.params.roomId);
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return res.status(400).json({ error: "roomId must be a positive integer" });
  }

  try {
    const [sold] = await pool.query(
      `SELECT c.id, c.name, c.role, c.batting_rating, c.bowling_rating, c.rating, c.base_price, c.country, tp.price
       FROM team_players tp
       JOIN cricketers c ON c.id = tp.player_id
       WHERE tp.room_id = ?
       ORDER BY c.role, c.name`,
      [roomId]
    );

    const [remaining] = await pool.query(
      `SELECT c.id, c.name, c.role, c.batting_rating, c.bowling_rating, c.rating, c.base_price, c.country
       FROM cricketers c
       LEFT JOIN (
         SELECT DISTINCT player_id FROM team_players WHERE room_id = ?
       ) sold ON sold.player_id = c.id
       WHERE sold.player_id IS NULL
       ORDER BY c.role, c.name`,
      [roomId]
    );

    return res.json({
      roomId,
      sold,
      remaining,
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

export default router;
