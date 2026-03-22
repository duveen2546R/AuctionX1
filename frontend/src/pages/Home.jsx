import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
    const [username, setUsername] = useState(localStorage.getItem("username") || "");
    const [roomCode, setRoomCode] = useState("");
    const [teamName, setTeamName] = useState(localStorage.getItem("teamName") || "");
    const [teams, setTeams] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/teams`)
            .then((res) => res.json())
            .then(setTeams)
            .catch(() => setTeams([]));
    }, []);

    const persistName = (name) => {
        setUsername(name);
        localStorage.setItem("username", name);
    };

    const persistTeam = (team) => {
        setTeamName(team);
        localStorage.setItem("teamName", team);
    };

    const createRoom = () => {
        const roomId = Math.floor(100000 + Math.random() * 900000);
        navigate(`/lobby/${roomId}`, { state: { username, teamName } });
    };

    const joinRoom = () => {
        if (!roomCode) return;
        navigate(`/lobby/${roomCode}`, { state: { username, teamName } });
    };

    const canProceed = username && teamName;

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="grid md:grid-cols-2 gap-8 glass-card p-8 w-full max-w-6xl">
                <div className="flex flex-col gap-4">
                    <span className="pill">Multiplayer · Live Bidding</span>
                    <h1 className="text-4xl font-semibold">IPL Auction Arena</h1>
                    <p className="text-slate-300">Pick your franchise, invite friends, and battle in real-time.</p>
                    <div className="grid md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-slate-400">Username</label>
                            <input
                                className="w-full mt-1 rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                                placeholder="Captain name"
                                value={username}
                                onChange={(e) => persistName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm text-slate-400">Team</label>
                            <select
                                className="w-full mt-1 rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                                value={teamName}
                                onChange={(e) => persistTeam(e.target.value)}
                            >
                                <option value="" disabled>Choose your franchise</option>
                                {teams.map((t) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                        <button className="primary-btn w-full" onClick={createRoom} disabled={!canProceed}>Create Room</button>
                        <div className="glass-card border border-dashed border-border p-3 flex flex-col gap-2">
                            <label className="text-sm text-slate-400">Room Code</label>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                                    placeholder="123456"
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value)}
                                />
                                <button className="primary-btn" onClick={joinRoom} disabled={!canProceed || !roomCode}>Join</button>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">Need 3+ players. Use multiple incognito windows to test locally.</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-900/40 to-slate-900/40 shadow-glass min-h-[320px] flex items-center justify-center">
                    <div className="absolute top-4 right-4 bg-orange-400 text-slate-900 px-3 py-1 rounded-full text-sm font-semibold">Live</div>
                    <div className="relative w-64 h-64">
                        <div className="absolute inset-0 blur-3xl bg-blue-400/20 rounded-full" />
                        <div className="absolute inset-10 rounded-full border border-accent/40 rotate-6" />
                        <div className="absolute inset-16 rounded-full border border-accent2/50 -rotate-6" />
                        <div className="absolute inset-[38%] w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full shadow-lg animate-bounce" />
                    </div>
                </div>
            </div>
        </div>
    );
}
