export default function PlayerCard({ player }) {
    return (
        <div className="card">
            <h2>{player.name}</h2>
            <p>Role: {player.role}</p>
            <p>Rating: ⭐ {player.rating}</p>
            <p>Base Price: ₹{player.base_price} Cr</p>
        </div>
    );
}