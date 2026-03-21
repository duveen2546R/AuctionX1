import { useEffect, useState } from "react";
import socket from "../socket";
import PlayerCard from "../components/PlayerCard";
import BidPanel from "../components/BidPanel";
import Timer from "../components/Timer";
import TeamList from "../components/TeamList";

export default function Auction() {
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [bid, setBid] = useState(0);
    const [team, setTeam] = useState([]);

    useEffect(() => {
        socket.on("new_player", (player) => {
            setCurrentPlayer(player);
            setBid(player.base_price);
        });

        socket.on("bid_update", (amount) => {
            setBid(amount);
        });

        socket.on("player_won", (data) => {
            if (data.isYou) {
                setTeam((prev) => [...prev, data.player]);
            }
        });

        return () => socket.off();
    }, []);

    const placeBid = () => {
        socket.emit("place_bid", bid + 10);
    };

    return (
        <div className="auction-container">
            <h2>Live Auction</h2>

            {currentPlayer && <PlayerCard player={currentPlayer} />}

            <Timer />

            <h3>Current Bid: ₹{bid} Cr</h3>

            <BidPanel onBid={placeBid} />

            <TeamList team={team} />
        </div>
    );
}