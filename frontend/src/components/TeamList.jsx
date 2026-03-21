export default function TeamList({ team }) {
    return (
        <div>
            <h3>Your Team</h3>
            {team.map((p, i) => (
                <p key={i}>{p.name}</p>
            ))}
        </div>
    );
}