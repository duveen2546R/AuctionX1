export default function BidPanel({ onBid }) {
    return (
        <div>
            <button onClick={onBid}>Place Bid (+10)</button>
        </div>
    );
}