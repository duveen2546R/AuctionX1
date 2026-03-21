import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import socket from "../socket";

export default function Lobby() {
    const { roomId } = useParams();
    const { state } = useLocation();
    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        socket.emit("join_room", { roomId, username: state.username });

        socket.on("players_update", (players) => {
            setPlayers(players);
        });

        socket.on("start_auction", () => {
            navigate(`/auction/${roomId}`);
        });

        return () => socket.off();
    }, []);

    return (
        <div className="container">
            <h2>Room: {roomId}</h2>

            <h3>Players:</h3>
            {players.map((p, i) => (
                <p key={i}>{p}</p>
            ))}

            <button onClick={() => socket.emit("start_auction", roomId)}>
                Start Auction
            </button>
        </div>
    );
}