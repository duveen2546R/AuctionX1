import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
    const [username, setUsername] = useState("");
    const navigate = useNavigate();

    const createRoom = () => {
        const roomId = Math.floor(Math.random() * 100000);
        navigate(`/lobby/${roomId}`, { state: { username } });
    };

    return (
        <div className="container">
            <h1>🏏 IPL Auction Game</h1>

            <input
                placeholder="Enter Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />

            <button onClick={createRoom}>Create Room</button>
        </div>
    );
}