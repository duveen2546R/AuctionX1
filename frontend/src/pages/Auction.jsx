import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket from "../socket";
import PlayerCard from "../components/PlayerCard";
import BidPanel from "../components/BidPanel";
import TeamList from "../components/TeamList";

export default function Auction() {
    const { state } = useLocation();
    const { roomId } = useParams();
    const navigate = useNavigate();
    const username = state?.username || localStorage.getItem("username") || "You";
    const teamName = state?.teamName || localStorage.getItem("teamName") || "";
    const slugMap = {
        "royal challengers bangalore": "banglore",
        "chennai super kings": "chennai",
        "delhi capitals": "delhi",
        "gujarat titans": "gujarat",
        "sunrisers hyderabad": "hyderabad",
        "kolkata knight riders": "kolkata",
        "lucknow super giants": "lucknow",
        "mumbai indians": "mumbai",
        "punjab kings": "punjab",
        "rajasthan royals": "rajasthan",
    };
    const bgSlug = teamName ? slugMap[teamName.toLowerCase()] || null : null;

    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [currentBid, setCurrentBid] = useState(0);
    const [lastBidder, setLastBidder] = useState(null);
    const [team, setTeam] = useState([]);
    const [warning, setWarning] = useState(null);
    const [hasPassed, setHasPassed] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [lastMyBid, setLastMyBid] = useState(null);
    const [eliminated, setEliminated] = useState(false);
    const [bidHistory, setBidHistory] = useState([]);
    const [step, setStep] = useState(0.1);
    const [budget, setBudget] = useState(100);
    const [chat, setChat] = useState([]);
    const [chatInput, setChatInput] = useState("");

    useEffect(() => {
        if (roomId) {
            socket.emit("join_room", { roomId, username, teamName });
        }

        socket.on("new_player", (player) => {
            setCurrentPlayer(player);
            setCurrentBid(player.base_price);
            setLastBidder(null);
            setWarning(null);
            setHasPassed(false);
            setStep(player.base_price < 12 ? 0.1 : player.base_price < 20 ? 0.25 : 0.5);
        });

        socket.on("bid_update", (payload) => {
            setCurrentBid(payload.amount);
            setLastBidder(payload.by);
            setWarning(null);
            if (payload.history) setBidHistory(payload.history);
            if (payload.step) setStep(payload.step);
        });

        socket.on("player_won", (data) => {
            if (data.isYou || (!data.isYou && data.winner === username)) {
                setTeam((prev) => [...prev, data.player]);
            }
            setWarning(null);
            setHasPassed(false);
            setLastMyBid(null);
            if (eliminated) setEliminated(true);
            setBidHistory([]);
        });

        socket.on("auction_complete", (payload) => {
            navigate("/result", {
                state: {
                    team,
                    disqualified: (payload?.disqualified || []).includes(username),
                    deadline: payload?.deadline || null,
                },
            });
        });

        socket.on("bid_warning", (payload) => {
            if (!payload) return;
            if (payload.stage === "once") setWarning(`Going once for ${payload.by || "current bid"}...`);
            if (payload.stage === "twice") setWarning(`Going twice for ${payload.by || "current bid"}...`);
        });

        socket.on("chat_message", (msg) => {
            setChat((c) => [...c.slice(-50), msg]);
        });

        socket.on("budget_update", (b) => {
            if (typeof b?.budget === "number") setBudget(Number(b.budget));
        });

        return () => socket.off();
    }, [navigate, roomId, username, teamName, team]);

    const placeBid = (amount) => {
        if (eliminated) return;
        socket.emit("place_bid", amount);
        setLastMyBid(amount);
    };

    const withdraw = () => {
        setEliminated(true);
        socket.emit("withdraw_bid");
    };

    const passPlayer = () => {
        if (hasPassed) return;
        setHasPassed(true);
        socket.emit("pass_player");
    };

    const sendChat = () => {
        const text = chatInput.trim();
        if (!text) return;
        socket.emit("chat_message", { roomId, text });
        setChatInput("");
    };

    const gridCols = sidebarOpen ? "lg:grid-cols-[320px_1fr]" : "lg:grid-cols-1";

    return (
        <div
            className="min-h-screen text-slate-100 px-4 py-6"
            style={
                bgSlug
                    ? {
                          backgroundImage: `linear-gradient(120deg, rgba(5,6,12,0.85), rgba(5,6,12,0.9)), url(/img/${bgSlug}.png)`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                      }
                    : { backgroundColor: "#05060c" }
            }
        >
            <div className={`grid ${gridCols} gap-4 max-w-6xl mx-auto`}>
                <aside className={`glass-card border border-border p-4 ${sidebarOpen ? "" : "hidden lg:hidden"}`}>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold">Your Team</h3>
                        <button className="ghost-btn text-sm" onClick={() => setSidebarOpen(false)}>
                            Hide
                        </button>
                    </div>
                    <TeamList team={team} />
                </aside>

                <main className="glass-card border border-border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {!sidebarOpen && (
                                <button className="ghost-btn text-xs" onClick={() => setSidebarOpen(true)}>
                                    Show Team
                                </button>
                            )}
                            <h2 className="text-2xl font-semibold">Live Auction</h2>
                        </div>
                        <div className="text-sm text-slate-400">Room: {roomId}</div>
                    </div>

                    <div className="flex gap-4 text-sm text-slate-300">
                        <span>Completed: {Math.max(0, (currentPlayer ? roomIdxStub - 1 : roomIdxStub))}</span>
                        <span>Remaining: —</span>
                    </div>

                    {currentPlayer && <PlayerCard player={currentPlayer} />}

                    <div className="flex items-center gap-3 text-lg">
                        <span className="font-semibold">Current Bid: ₹{currentBid} Cr</span>
                        {lastBidder && <span className="text-slate-400">(by {lastBidder})</span>}
                    </div>
                    {warning && <p className="text-amber-300 text-sm">{warning}</p>}

                    <BidPanel
                        currentBid={currentBid}
                        step={step}
                        budget={budget}
                        onBid={placeBid}
                        onWithdraw={withdraw}
                        onPass={passPlayer}
                        isPassed={hasPassed}
                        isEliminated={eliminated}
                    />

                    <div className="flex justify-between text-sm text-slate-400 border-t border-border pt-3">
                        <span>Your team: {teamName || "No team"}</span>
                        <span>
                            {eliminated
                                ? "You withdrew and are out."
                                : hasPassed
                                    ? "You passed this player."
                                    : lastMyBid
                                        ? `Your last bid: ₹${lastMyBid} Cr`
                                        : "No bid yet"}
                        </span>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-3">
                        <div className="glass-card border border-border p-3">
                            <div className="font-semibold mb-2">Live Bids</div>
                            {bidHistory.length === 0 && <p className="text-slate-400 text-sm">No bids yet.</p>}
                            {bidHistory.slice().reverse().map((h, i) => (
                                <div key={i} className="flex justify-between text-sm border-b border-border/60 py-1">
                                    <span>{h.by || "—"}</span>
                                    <span>₹{h.amount} Cr</span>
                                    <span className="text-slate-400">{h.note || ""}</span>
                                </div>
                            ))}
                        </div>

                        <div className="glass-card border border-border p-3 flex flex-col h-60">
                            <div className="font-semibold mb-2">Chat</div>
                            <div className="flex-1 overflow-y-auto flex flex-col gap-1 text-sm">
                                {chat.map((m, i) => (
                                    <div key={i} className="text-slate-200">
                                        <span className="font-semibold">{m.user}:</span> <span>{m.text}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <input
                                    className="flex-1 rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                                    placeholder="Type a message"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && sendChat()}
                                />
                                <button className="primary-btn" onClick={sendChat}>Send</button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
